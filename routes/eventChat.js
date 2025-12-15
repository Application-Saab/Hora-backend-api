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

    if (!members || !Array.isArray(members) || members.length !== 2) {
      return res.status(400).send({
        success: false,
        message: "Direct chat must contain exactly 2 userIds.",
      });
    }

    const [userId1, userId2] = members;

    const existingRoom = await ChatRoom.findOne({
      roomType: "direct",
      "members.userId": { $all: [userId1, userId2] },
      $expr: { $eq: [{ $size: "$members" }, 2] },
    });

    if (existingRoom) {
      return res.status(200).send({
        success: true,
        message: "Direct room already exists",
        room: existingRoom,
      });
    }

    // Fetch details from User DB for both users
    const user1 = await User.findById(userId1);
    const user2 = await User.findById(userId2);

    if (!user1 || !user2) {
      return res.status(404).send({
        success: false,
        message: "One or both users not found",
      });
    }

    const membersArr = [
      {
        userId: user1._id,
        name: user1.name || "",
        phone: user1.phone || "",
        profileImageUrl: user1.avatar || "",
      },
      {
        userId: user2._id,
        name: user2.name || "",
        phone: user2.phone || "",
        profileImageUrl: user2.avatar || "",
      },
    ];

    // create new room
    const newRoom = new ChatRoom({
      roomName: `${user1.name || "User"} & ${user2.name || "User"}`,
      createdBy: userId1,
      roomType: "direct",
      members: membersArr,
      eventId,
    });

    const savedRoom = await newRoom.save();

    return res.status(200).send({
      success: true,
      message: "Direct chat room created successfully",
      data: savedRoom,
    });
  } catch (error) {
    console.error("Create Direct Room Error:", error);

    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// Get all rooms joined by a user
router.get("/chatrooms/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    // updated query for new members schema
    const rooms = await ChatRoom.find({ "members.userId": userId })
      .select(
        "roomId eventId roomName members createdAt roomProfileUrl roomType"
      )
      .lean();

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
    const limit = parseInt(req.query.limit) || 10000; // default 10000 messages
    const page = parseInt(req.query.page) || 1; // page number

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
