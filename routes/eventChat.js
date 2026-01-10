const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ChatRoom = require("../models/eventChatRoom");
const ChatMessage = require("../models/eventMessage");
const PushSub = require("../models/pushSubscription");
const { ioInstance } = require("../socket");
const { computeUnreadCountsForUser } = require("../utils/chatUnread");
const User = require("../models/user");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

// Create direct chat room for one-to-one chat
router.post("/create-direct-room", async (req, res) => {
  try {
    const { members, eventId } = req.body;

    // Validation
    if (!Array.isArray(members) || members.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "Direct chat must contain exactly 2 userIds.",
      });
    }

    // Normalize + sort (for uniqueness)
    const memberIds = members.map(String).sort();
    const [userId1, userId2] = memberIds;

    if (
      !mongoose.Types.ObjectId.isValid(userId1) ||
      !mongoose.Types.ObjectId.isValid(userId2)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    // directKey
    const directKey = `direct::${eventId || "global"}::${userId1}_${userId2}`;

    // Fast existing check
    const existingRoom = await ChatRoom.findOne({
      roomType: "direct",
      directKey,
    }).lean();

    if (existingRoom) {
      return res.status(200).json({
        success: true,
        message: "Direct room already exists",
        room: existingRoom,
      });
    }

    // Fetch both users in one query
    const users = await User.find({
      _id: { $in: memberIds },
    }).lean();

    if (users.length !== 2) {
      return res.status(404).json({
        success: false,
        message: "One or both users not found",
      });
    }

    // Map users
    const userMap = {};
    users.forEach((u) => {
      userMap[String(u._id)] = u;
    });

    const membersArr = memberIds.map((id) => {
      const u = userMap[id];
      return {
        userId: u._id,
        name: u.name || "",
        phone: u.phone || "",
        profileImageUrl: u.avatar || "",
      };
    });

    // Create room
    const newRoom = await ChatRoom.create({
      roomType: "direct",
      directKey,
      eventId,
      createdBy: members[0], // starter user (frontend order)
      roomName: `${userMap[userId1].name || "User"} & ${
        userMap[userId2].name || "User"
      }`,
      members: membersArr,
    });

    return res.status(200).json({
      success: true,
      message: "Direct chat room created successfully",
      data: newRoom,
    });
  } catch (error) {
    // Handle duplicate race condition safely
    if (error.code === 11000) {
      const room = await ChatRoom.findOne({
        roomType: "direct",
        directKey: error.keyValue?.directKey,
      }).lean();

      return res.status(200).json({
        success: true,
        message: "Direct room already exists",
        room,
      });
    }

    console.error("Create Direct Room Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get all rooms joined by a user
// router.get("/chatrooms/user/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return sendResponse(res, 400, true, "Invalid user ID");
//     }

//     const userObjectId = new mongoose.Types.ObjectId(userId);

//     const rooms = await ChatRoom.find(
//       { "members.userId": userObjectId },
//       {
//         roomId: 1,
//         eventId: 1,
//         roomName: 1,
//         members: 1,
//         createdAt: 1,
//         roomProfileUrl: 1,
//         roomType: 1,
//       }
//     )
//       .sort({ createdAt: -1 })
//       .lean()
//       .hint({ "members.userId": 1 });

//     return sendResponse(res, 200, false, "Rooms fetched successfully", rooms);
//   } catch (err) {
//     console.error("Fetch Rooms Error:", {
//       message: err.message,
//       stack: err.stack,
//       userId: req.params.userId,
//     });
//     return sendResponse(res, 500, true, "Server error");
//   }
// });

// Get all rooms joined by a user
router.get("/chatrooms/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Use aggregation to join latest message and sort
    const rooms = await ChatRoom.aggregate([
      {
        $match: { "members.userId": userObjectId },
      },
      {
        $lookup: {
          from: "eventmessages", // Your EventMessage collection name (lowercase mongoose default)
          localField: "_id",
          foreignField: "groupId",
          as: "latestMessages",
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
        },
      },
      {
        $addFields: {
          lastMessageAt: {
            $arrayElemAt: ["$latestMessages.createdAt", 0],
          },
        },
      },
      {
        $project: {
          // Include all needed fields
          roomId: 1,
          eventId: 1,
          roomProfileUrl: 1,
          roomName: 1,
          createdBy: 1,
          roomType: 1,
          directKey : 1,
          members: 1,
          createdAt: 1,
          lastReadAt: 1,
          lastMessageAt: 1, // Add this to response
          // Add any other fields if needed, like lastReadAt
        },
      },
      {
        $sort: {
          lastMessageAt: -1, // Latest message first
          createdAt: -1, // Fallback to room creation if no messages
        },
      },
    ]);

    return sendResponse(res, 200, false, "Rooms fetched successfully", rooms);
  } catch (err) {
    console.error("Fetch Rooms Error:", {
      message: err.message,
      stack: err.stack,
      userId: req.params.userId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get chat messages for a room with pagination
router.get("/messages/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 10000;
    const page = parseInt(req.query.page) || 1;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return sendResponse(res, 400, true, "Invalid room ID");
    }

    // Latest messages first
    const messages = await ChatMessage.find({ groupId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return sendResponse(
      res,
      200,
      false,
      "Messages fetched successfully",
      messages.reverse()
    );
  } catch (err) {
    console.error("Fetch Messages Error:", {
      message: err.message,
      stack: err.stack,
      groupId: req.params.groupId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// existing mark-read route
router.post("/mark-read", async (req, res) => {
  try {
    const { groupId, userId } = req.body;
    if (
      !mongoose.Types.ObjectId.isValid(groupId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res.status(400).json({ error: true, message: "Invalid ids" });
    }

    const room = await ChatRoom.findById(groupId);
    if (!room)
      return res.status(404).json({ error: true, message: "Room not found" });

    room.lastReadAt.set(String(userId), new Date());
    await room.save();

    // compute unreadCounts for this user (for all rooms) after marking
    const allCounts = await computeUnreadCountsForUser(userId);

    // emit socket update to other members
    ioInstance &&
      ioInstance.to(groupId.toString()).emit("message:read:update", {
        groupId,
        userId,
        lastReadAt: room.lastReadAt.get(String(userId)) || new Date(),
      });

    return res.json({
      error: false,
      message: "Marked as read",
      unreadCounts: allCounts,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Get chatroom unread by userid
router.get("/chatrooms/:userId/unread", async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId))
    return res.status(400).json({ error: true, message: "Invalid userId" });
  const counts = await computeUnreadCountsForUser(userId);
  return res.json({ error: false, data: counts });
});

// subscribe for notification
router.post("/subscribe", async (req, res) => {
  try {
    const { userId, groupId, subscription, fcmToken } = req.body;
    if (!userId)
      return res.status(400).json({ error: true, message: "userId required" });

    if (subscription) {
      // upsert by endpoint
      await PushSub.updateOne(
        { "subscription.endpoint": subscription.endpoint },
        {
          $set: {
            userId,
            groupId: groupId || null,
            subscription,
            fcmToken: fcmToken || null,
          },
        },
        { upsert: true }
      );
    } else if (fcmToken) {
      await PushSub.updateOne(
        { fcmToken },
        {
          $set: {
            userId,
            groupId: groupId || null,
            fcmToken,
          },
        },
        { upsert: true }
      );
    } else {
      return res
        .status(400)
        .json({ error: true, message: "subscription or fcmToken required" });
    }
    return res.json({ error: false });
  } catch (err) {
    console.error("subscribe error", err);
    return res.status(500).json({ error: true, message: "server error" });
  }
});

//  unsubscribe for notification
router.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint, fcmToken } = req.body;
    if (endpoint) {
      await PushSub.deleteOne({ "subscription.endpoint": endpoint });
      return res.json({ error: false });
    } else if (fcmToken) {
      await PushSub.deleteOne({ fcmToken });
      return res.json({ error: false });
    }
    return res.status(400).json({ error: true });
  } catch (err) {
    console.error("unsubscribe", err);
    return res.status(500).json({ error: true });
  }
});

module.exports = router;
