const ChatRoom = require("../models/eventChatRoom");
const ChatMessage = require("../models/eventMessage");
const mongoose = require("mongoose");

async function computeUnreadCountsForUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return {};

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // UPDATED QUERY members.userId
  const rooms = await ChatRoom.find({ "members.userId": userObjectId }).lean();
  // const rooms = await ChatRoom.find({ members: userObjectId }).lean();

  const counts = {};

  await Promise.all(
    rooms.map(async (room) => {
      const groupId = room._id;

      // Handle Map vs Object
      const lastReadMap = room.lastReadAt || {};

      let lastReadForUser = null;

      if (typeof lastReadMap.get === "function") {
        // When not using .lean()
        lastReadForUser = lastReadMap.get(String(userId));
      } else {
        // lean() converts Map to plain object
        lastReadForUser = lastReadMap[String(userId)];
      }

      const since = lastReadForUser ? new Date(lastReadForUser) : new Date(0);

      const query = {
        // roomId: groupId,
        groupId: groupId,
        senderId: { $ne: userObjectId },
        createdAt: { $gt: since },
      };

      const count = await ChatMessage.countDocuments(query);
      counts[String(groupId)] = count;
    })
  );

  return counts;
}

module.exports = { computeUnreadCountsForUser };
