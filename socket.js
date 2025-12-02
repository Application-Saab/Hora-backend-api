const { Server } = require("socket.io");
const ChatRoom = require("./models/eventChatRoom");
const EventMessage = require("./models/eventMessage");
const { sendPushToRoom } = require("./store/chatNotifications");

let ioInstance = null;

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    const userId = socket.handshake.query.userId;
    console.log(
      "%c [ userId ]-21",
      "font-size:13px; background:pink; color:#bf2c9f;",
      userId
    );

    if (!userId || userId === "null") {
      console.log("Invalid userId → skipping room join");
      return;
    }

    socket.userId = userId;

    // --------------------------------------------------
    // JOIN ALL CHAT ROOMS
    // --------------------------------------------------
    const rooms = await ChatRoom.find({ members: userId }).select("_id");

    rooms.forEach((room) => socket.join(room._id.toString()));

    console.log(
      "Joined rooms:",
      rooms.map((r) => r._id.toString())
    );

    // --------------------------------------------------
    // SEND MESSAGE
    // --------------------------------------------------
    // socket.on("message:send", async (data) => {
    //   try {
    //     const { roomId, message, type, tempId, mediaUrl } = data;

    //     // Save
    //     const saved = await EventMessage.create({
    //       roomId,
    //       senderId: userId,
    //       message,
    //       type: type || "text",
    //       mediaUrl: mediaUrl || "",
    //     });

    //     // Broadcast
    //     io.to(roomId).emit("message:new", {
    //       _id: saved._id,
    //       roomId,
    //       senderId: userId,
    //       message,
    //       type,
    //       mediaUrl,
    //       tempId, // frontend will match and replace
    //       createdAt: saved.createdAt,
    //     });
    //   } catch (err) {
    //     console.log("Message error:", err);
    //   }
    // });

    socket.on("message:send", async (data) => {
      try {
        const { roomId, message, type, tempId, mediaUrl } = data;

        // 1) SAVE MESSAGE
        const saved = await EventMessage.create({
          roomId,
          senderId: userId,
          message,
          type: type || "text",
          mediaUrl: mediaUrl || "",
        });

        const finalMsg = {
          _id: saved._id,
          roomId,
          senderId: userId,
          message,
          type,
          mediaUrl,
          tempId,
          createdAt: saved.createdAt,
        };

        // 2) SEND REALTIME MESSAGE
        io.to(roomId).emit("message:new", finalMsg);

        // 3) SEND PUSH NOTIFICATION
        // sendPushToRoom(roomId, message, {
        //   title: "New Message",
        //   body: message,
        //   data: {
        //     messageId: saved._id,
        //     roomId,
        //     senderId: userId,
        //   },
        // });

        sendPushToRoom(roomId, message, {
          roomName: "test room name",
          title: "New message from backend",
          body: message,
          data: { messageId: saved._id, senderId: socket.userId },
        });
      } catch (err) {
        console.log("Message error:", err);
      }
    });

    socket.on("message:read", async ({ roomId, userId }) => {
      const room = await ChatRoom.findOne({ roomId });
      if (!room) return;

      room.lastReadAt.set(userId, new Date());
      await room.save();

      io.to(roomId.toString()).emit("message:read:update", {
        roomId,
        userId,
        lastReadAt: room.lastReadAt.get(userId),
      });
    });

    // socket.on("message:send", async (data) => {
    //   const { roomId, message, tempId } = data;
    //   const saved = await EventMessage.create({
    //     roomId,
    //     senderId: socket.userId,
    //     message,
    //     tempId,
    //   });
    //   io.to(roomId).emit("message:new", { ...saved.toObject(), tempId });

    //   // Send web push notifications to other members
    //   sendPushToRoom(roomId, message, {
    //     roomName: "test room name",
    //     title: "New message",
    //     body: message,
    //     data: { messageId: saved._id, senderId: socket.userId },
    //   });
    // });

    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
    });
  });

  ioInstance = io;
}

module.exports = { initSocket };
