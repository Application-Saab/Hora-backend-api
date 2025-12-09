const ChatRoom = require("../models/eventChatRoom");
const ChatMessage = require("../models/eventMessage");
const mongoose = require("mongoose");

async function computeUnreadCountsForUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return {};

  // Convert userId once
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Find rooms where user is member
  const rooms = await ChatRoom.find({ members: userObjectId }).lean();

  const counts = {};

  await Promise.all(
    rooms.map(async (room) => {
      const roomId = room._id;
      const lastReadMap = room.lastReadAt || {};

      // lastReadAt stored as Map or object
      const lastReadForUser =
        lastReadMap.get?.(String(userId)) || lastReadMap[String(userId)];

      const since = lastReadForUser ? new Date(lastReadForUser) : new Date(0);

      const q = {
        roomId: roomId,
        senderId: { $ne: userObjectId },
        createdAt: { $gt: since },
      };

      const c = await ChatMessage.countDocuments(q);
      counts[String(roomId)] = c;
    })
  );

  return counts;
}

module.exports = { computeUnreadCountsForUser };
