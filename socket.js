const { Server } = require("socket.io");
const ChatRoom = require("./models/eventChatRoom");
const EventMessage = require("./models/eventMessage");
const { sendPushToRoom } = require("./store/chatNotifications");
const { computeUnreadCountsForUser } = require("./utils/chatUnread");

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

    // JOIN ALL CHAT ROOMS
    // const rooms = await ChatRoom.find({ members: userId }).select("_id");
    const rooms = await ChatRoom.find({ "members.userId": userId }).select("_id");

    rooms.forEach((room) => socket.join(room._id.toString()));

    console.log(
      "Joined rooms:",
      rooms.map((r) => r._id.toString())
    );

    // Send authoritative unread counts to this socket on connect
    try {
      const unread = await computeUnreadCountsForUser(userId);
      socket.emit("unread:counts:init", unread); // frontend will listen and seed unreadCounts
    } catch (e) {
      console.error("Failed compute unread on connect:", e);
    }

    socket.on("message:send", async (data) => {
      try {
        const {
          // roomId,
          groupId,
          message,
          type,
          tempId,
          mediaUrl,
          senderName,
          senderPhone,
        } = data;
        const saved = await EventMessage.create({
          // roomId,
          groupId,
          senderId: socket.userId,
          message,
          type: type || "text",
          mediaUrl: mediaUrl || "",
          senderName,
          senderPhone,
        });

        const finalMsg = {
          _id: saved._id,
          // roomId,
          groupId,
          senderId: socket.userId,
          message,
          type,
          mediaUrl,
          tempId,
          createdAt: saved.createdAt,
          senderName,
          senderPhone,
        };

        io.to(groupId).emit("message:new", finalMsg);

        // send push notifications (async, don't block)
        sendPushToRoom(groupId, message, {
          roomName: "",
          body: message,
          icon: "",
          data: { messageId: saved._id, senderId: socket.userId },
        }).catch((err) => console.error("sendPushToRoom error", err));
      } catch (err) {
        console.error("Message error:", err);
      }
    });

    socket.on("message:read", async ({ groupId, userId }) => {
      const room = await ChatRoom.findOne({ _id: groupId });
      if (!room) return;

      room.lastReadAt.set(userId, new Date());
      await room.save();

      io.to(groupId.toString()).emit("message:read:update", {
        groupId,
        userId,
        lastReadAt: room.lastReadAt.get(userId),
      });
    });

    // DISCONNECT
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  ioInstance = io;
}

module.exports = { initSocket, ioInstance };
