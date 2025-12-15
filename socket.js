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
    const userId = socket.handshake.query.userId;
    if (!userId || userId === "null") {
      return;
    }

    socket.userId = userId;

    // JOIN ALL CHAT ROOMS
    const rooms = await ChatRoom.find({ "members.userId": userId }).select(
      "_id"
    );

    rooms.forEach((room) => socket.join(room._id.toString()));

    // Join event room for event specific updates
    socket.on("joinEvent", (eventId) => {
      socket.join(eventId);
      console.log(`User ${userId} joined event room ${eventId}`);
    });

    socket.on("leaveEvent", (eventId) => {
      socket.leave(eventId);
      console.log(`User ${userId} left event room ${eventId}`);
    });

    // Send authoritative unread counts to this socket on connect
    try {
      const unread = await computeUnreadCountsForUser(userId);
      socket.emit("unread:counts:init", unread);
    } catch (e) {
      console.error("Failed compute unread on connect:", e);
    }

    socket.on("message:send", async (data) => {
      try {
        let {
          groupId,
          eventId,
          message,
          type,
          tempId,
          mediaUrl,
          senderName,
          senderPhone,
        } = data;

        // If group id not available for info type messages
        if (!groupId) {
          const room = await ChatRoom.findOne({
            eventId,
            roomType: "group",
          });

          if (!room) {
            console.log("No group room found for eventId:", eventId);
            return;
          }
          groupId = room._id;
        }
        const saved = await EventMessage.create({
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

        // send push notifications
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

    // Socket for update rsvp list on submit
    socket.on("rsvp:updated", ({ eventId }) => {
      io.to(eventId.toString()).emit("rsvp:refetch", { eventId });
    });

    // Disconnect socket
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  ioInstance = io;
}

module.exports = { initSocket, ioInstance };
