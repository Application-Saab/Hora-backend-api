const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const AWS = require("aws-sdk");
const EventInvite = require("../models/event-invite");
const EventGuest = require("../models/event-guest");
const TicketCounter = require("../models/ticket-counter-luckydraw");
const EventImages = require("../models/eventImages");
const multer = require("multer");
const fs = require("fs");
const fsPromises = require("fs").promises;

const {
  generateThumbnail,
  generateTemplateThumbnail,
  generateVideoPreview,
  // compressVideo,
} = require("../store/multerS3Config");
const eventPosts = require("../models/event-posts");
const postLikes = require("../models/post-likes");
const postComment = require("../models/post-comment");
const ChatRoom = require("../models/eventChatRoom");
const ChatMessage = require("../models/eventMessage");
const PushSub = require('../models/pushSubscription');
const { cleanupLocalFiles } = require("../store/cleanupLocalFiles");

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const S3_BUCKET = process.env.S3_BUCKET_NAME;

// Helper: Delete image from S3
async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

const eventGuestSchema = Joi.object({
  userId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation"),
  eventId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation"),
  name: Joi.string().trim().allow("").optional(),
  phone: Joi.string().trim().allow("").optional(),
  rsvpStatus: Joi.string()
    .valid("will Come", "Sure, will try")
    .allow("")
    .optional(),
});

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

// Combined route: Create event + register host as guest + create new room
router.post("/create-event-invite", async (req, res) => {
  try {
    const {
      userId,
      eventType,
      hostName,
      eventDate,
      eventTime,
      location,
      googleMapLink,
    } = req.body;

    const User = require("../models/user");

    // Generate wonderland_id
    const lastWonderlandId = await EventInvite.findOne()
      .sort({ wonderland_id: -1 })
      .select("wonderland_id");

    const nextWonderlandId =
      lastWonderlandId && lastWonderlandId.wonderland_id
        ? Number(lastWonderlandId.wonderland_id) + 1
        : 2206;

    // Count user’s existing events
    const existingEventsCount = await EventInvite.countDocuments({ userId });

    // If first event, update user name from hostName
    let user = await User.findById(userId);
    if (existingEventsCount === 0 && hostName) {
      if (user) {
        user.name = hostName;
        await user.save();
      }
    }

    // Create event
    const eventInvite = new EventInvite({
      userId,
      eventType,
      hostName,
      eventDate: eventDate ? new Date(eventDate) : "",
      eventTime,
      location,
      wonderland_id: Number(nextWonderlandId),
      googleMapLink,
    });

    // Save event
    const savedInvite = await eventInvite.save();

    // Check if host already exists as a guest for this event
    const existingGuest = await EventGuest.findOne({
      userId,
      eventId: savedInvite._id,
    });

    // Determine which name to use for guest
    let guestNameToUse = "";
    if (existingEventsCount === 0 && hostName) {
      // first event → use hostName
      guestNameToUse = hostName;
    } else if (user && user.name) {
      // otherwise → use name from user collection
      guestNameToUse = user.name;
    }

    // Create guest entry with RSVP = "will Come" if not already exists
    if (!existingGuest) {
      const guest = new EventGuest({
        userId,
        eventId: savedInvite._id,
        name: guestNameToUse,
        rsvpStatus: "will Come",
        isHost: true,
      });
      savedGuest = await guest.save();
    }

    // Create chat room for the event
    const newRoom = new ChatRoom({
      roomId: savedInvite._id,
      roomName: hostName,
      createdBy: userId,
      members: [userId], // ADD HOST AS FIRST MEMBER
    });

    await newRoom.save();

    // Final response
    return sendResponse(
      res,
      201,
      false,
      "Event created & host registered as guest",
      savedInvite
    );
  } catch (err) {
    console.error("Create Invite+Guest Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch event details by eventId(_id)
router.get("/event-invites/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    const invite = await EventInvite.findById(id).lean();
    if (!invite) {
      return sendResponse(res, 404, true, "Event invite not found");
    }

    const userId = invite.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(
        res,
        400,
        true,
        "Invalid or missing user ID in event invite"
      );
    }

    const eventImage = await EventImages.findOne({
      eventId: id,
      userId,
    }).lean();
    const luckyDrawImages = eventImage
      ? eventImage.luckyDrawImages.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )
      : [];

    return sendResponse(
      res,
      200,
      false,
      "Event invite and lucky draw images fetched successfully",
      { ...invite, luckyDraws: luckyDrawImages }
    );
  } catch (err) {
    console.error("Fetch Invite and Lucky Draw Images Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.id,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch all event invites for a user as a guest or host
router.get("/event-invites/all/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    // Fetch all events hosted by user
    const hostedEvents = await EventInvite.find({ userId }).lean();

    // Fetch all guest entries by user
    const guestEntries = await EventGuest.find({ userId }).lean();

    const guestEventIds = guestEntries.map((guest) => guest.eventId.toString());
    const hostedEventIds = hostedEvents.map((event) => event._id.toString());

    // Fetch event details for guest entries (excluding those that user hosted)
    const asAGuestEvents = await EventInvite.find({
      _id: { $in: guestEventIds.filter((id) => !hostedEventIds.includes(id)) },
    }).lean();

    // Filter only valid events (having all required details)
    const isValidEvent = (event) => event.hostName;

    const filteredHosted = (hostedEvents || []).filter(isValidEvent);
    const filteredGuest = (asAGuestEvents || []).filter(isValidEvent);

    return sendResponse(res, 200, false, "Events fetched successfully", {
      hostedEvents: filteredHosted,
      asAGuestEvents: filteredGuest,
    });
  } catch (err) {
    console.error("Fetch Events Error:", {
      message: err.message,
      stack: err.stack,
      userId: req.params.userId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Update event invite
router.put("/event-invites/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendResponse(res, 400, true, "Invalid event ID");
  }

  try {
    // Find the existing invite
    const existing = await EventInvite.findById(id);
    if (!existing) return sendResponse(res, 404, true, "Invite not found");

    const {
      eventType,
      hostName,
      eventDate,
      eventTime,
      location,
      googleMapLink,
    } = req.body;

    // Check if this is the first event for the user and hostName is not already set
    const oldestEvent = await EventInvite.findOne({
      userId: existing.userId,
    }).sort({ createdAt: 1 });
    const isFirstEvent = oldestEvent && oldestEvent._id.equals(existing._id);

    if (isFirstEvent && !existing.hostName && hostName) {
      const User = require("../models/user");
      const user = await User.findById(existing.userId);
      if (user) {
        user.name = hostName;
        await user.save();
      }
    }

    // Update other fields
    if (eventType !== undefined) existing.eventType = eventType;
    if (hostName !== undefined) existing.hostName = hostName;
    if (eventDate !== undefined || "") existing.eventDate = new Date(eventDate);
    if (eventTime !== undefined) existing.eventTime = eventTime;
    if (location !== undefined) existing.location = location;
    if (googleMapLink !== undefined) existing.googleMapLink = googleMapLink;

    // Save updated document
    const updated = await existing.save();
    return sendResponse(
      res,
      200,
      false,
      "Invite updated successfully",
      updated
    );
  } catch (err) {
    console.error("Update Invite Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
      eventId: id,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Create A guest for an event by userId and eventId
router.post("/event-guest", async (req, res) => {
  try {
    const { error, value } = eventGuestSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    const { userId, eventId, name, rsvpStatus } = value;

    // Check for existing guest with same userId and eventId
    const existingGuest = await EventGuest.findOne({ userId, eventId }).lean();
    if (existingGuest) {
      return sendResponse(
        res,
        409,
        true,
        "User is already registered for this event"
      );
    }

    const eventGuest = new EventGuest({
      userId,
      eventId,
      name: name || "",
      rsvpStatus: rsvpStatus || "",
    });

    const savedGuest = await eventGuest.save();
    return sendResponse(res, 201, false, "Event guest created", savedGuest);
  } catch (err) {
    console.error("Create Guest Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });

    return sendResponse(res, 500, true, "Server error");
  }
});

//  Get all Guest details by event and user id for a particular event
router.get("/event-guest/:eventId/user/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    // Validate eventId and userId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    // Find the guest details by userId and eventId
    const guest = await EventGuest.findOne({ userId, eventId }).lean();
    if (!guest) {
      return sendResponse(
        res,
        200,
        false,
        "User not registered to this event",
        []
      );
    }

    // Find lucky draw images for the user and event
    const eventImage = await EventImages.findOne({ eventId, userId }).lean();
    const luckyDrawImages = eventImage
      ? eventImage.luckyDrawImages.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )
      : [];

    return sendResponse(
      res,
      200,
      false,
      "User details and lucky draw images fetched successfully",
      { ...guest, luckyDraws: luckyDrawImages }
    );
  } catch (err) {
    console.error("Fetch User and Lucky Draw Images Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.eventId,
      userId: req.params.userId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get all guests details for an event by eventId
router.get("/event-guests/all/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    const guests = await EventGuest.find({ eventId }).lean();
    if (!guests || guests.length === 0) {
      return sendResponse(res, 404, true, "No guests found for this event");
    }

    return sendResponse(res, 200, false, "Guests fetched successfully", guests);
  } catch (err) {
    console.error("Fetch Guests Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.eventId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Update RSVP status or name of a guest + Join to event chat room
router.put("/event-guest", async (req, res) => {
  try {
    const { eventId, userId, name, rsvpStatus } = req.body;

    const schema = Joi.object({
      eventId: Joi.string().required(),
      userId: Joi.string().required(),
      name: Joi.string().trim().allow("").optional(),
      rsvpStatus: Joi.string()
        .valid("will Come", "Sure, will try", "")
        .optional(),
    });

    const { error } = schema.validate(
      { eventId, userId, name, rsvpStatus },
      { abortEarly: false }
    );

    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return sendResponse(res, 400, true, "Invalid event ID or user ID");
    }

    // FIND GUEST ENTRY
    const updatedGuest = await EventGuest.findOne({ eventId, userId });
    if (!updatedGuest) {
      return sendResponse(res, 404, true, "Guest not found");
    }

    let updateData = {};
    if (name !== undefined) updateData.name = name;
    if (rsvpStatus !== undefined) updateData.rsvpStatus = rsvpStatus;

    // UPDATE USER NAME ALSO
    if (name !== undefined) {
      const User = require("../models/user");
      const user = await User.findById(updatedGuest.userId);
      if (user) {
        user.name = name;
        await user.save();
      }
    }

    Object.assign(updatedGuest, updateData);
    const savedGuest = await updatedGuest.save();

    // ADD TO ROOM MEMBER LIST (AUTO JOIN ROOM)
    await ChatRoom.findOneAndUpdate(
      { roomId: eventId },
      { $addToSet: { members: userId } } // Avoid duplicates
    );

    return sendResponse(
      res,
      200,
      false,
      "Guest updated & added to chat room",
      savedGuest
    );
  } catch (err) {
    console.error("Update Guest Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get all rooms joined by a user
router.get("/chatrooms/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    const rooms = await ChatRoom.find({ members: userId })
      .select("roomId roomName members createdAt")
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
router.get("/chat/messages/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50; // default 50 messages
    const page = parseInt(req.query.page) || 1; // page number

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return sendResponse(res, 400, true, "Invalid room ID");
    }

    // Latest messages first (reverse later for UI)
    const messages = await ChatMessage.find({ roomId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return sendResponse(
      res,
      200,
      false,
      "Messages fetched successfully",
      messages.reverse() // UI ke liye ascending order
    );
  } catch (err) {
    console.error("Fetch Messages Error:", {
      message: err.message,
      stack: err.stack,
      roomId: req.params.roomId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Mark messages as read for a user in a room
router.post("/mark-read", async (req, res) => {
  try {
    const { roomId, userId } = req.body;

    const room = await ChatRoom.findOne({ _id: roomId });
    if (!room)
      return res.status(404).json({ error: true, message: "Room not found" });

    room.lastReadAt.set(userId, new Date());
    await room.save();

    return res.json({ error: false, message: "Marked as read" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

router.post("/subscribe", async (req, res) => {
  try {
    const { userId, roomId, subscription } = req.body;
    if (!subscription || !userId)
      return res.status(400).json({ error: true, message: "missing" });

    // optionally dedupe by endpoint
    await PushSub.updateOne(
      { "subscription.endpoint": subscription.endpoint },
      { $set: { userId, roomId: roomId || null, subscription } },
      { upsert: true }
    );
    return res.json({ error: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: true });
  }
});

router.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: true });
    await PushSub.deleteOne({ "subscription.endpoint": endpoint });
    return res.json({ error: false });
  } catch (err) {
    return res.status(500).json({ error: true });
  }
});

// Temporary storage for uploaded files
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 20MB limit
}).single("image");

const uploadImageToS3 = async (
  filePath,
  fileName,
  userId,
  eventId,
  mimeType,
  folderName
) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${folderName}/${userId}/${eventId}/${fileName}`, // Folder name at the start
    Body: fs.createReadStream(filePath),
    ContentType: mimeType,
  };
  const data = await s3.upload(params).promise();
  return data;
};

router.post("/get-presigned-url", async (req, res) => {
  try {
    const { fileName, fileType, folder, userId, eventId } = req.body;
    if (!fileName || !fileType)
      return res.status(400).json({ message: "Missing file data" });

    const key = `${folder}/${userId}/${eventId}/${Date.now()}-${fileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Expires: 300,
    };

    const uploadURL = await s3.getSignedUrlPromise("putObject", params);
    res.json({ uploadURL, key });
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create A Post Route for already-uploaded S3 media
router.post("/event-posts/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      postById,
      postByName,
      postType,
      badgeId,
      taggedUserIds,
      postUrl,
      postKey,
      postWebpUrl,
      postWebpKey,
    } = req.body;

    // Basic validations
    if (!mongoose.Types.ObjectId.isValid(eventId))
      return sendResponse(res, 400, true, "Invalid event ID");
    if (!postById || !mongoose.Types.ObjectId.isValid(postById))
      return sendResponse(res, 400, true, "Invalid postById");
    if (!postByName)
      return sendResponse(res, 400, true, "postByName is required");
    if (!postUrl || !postKey)
      return sendResponse(res, 400, true, "postUrl and postKey are required");
    if (
      !["selfUploaded", "thankYouNote", "postBadge", "luckyDraw"].includes(
        postType
      )
    )
      return sendResponse(res, 400, true, "Invalid postType");

    // LuckyDraw ticketNumber handling
    let ticketNumber = null;
    if (postType === "luckyDraw") {
      const counter = await TicketCounter.findOneAndUpdate(
        { _id: "luckyDrawCounter" },
        { $inc: { sequenceValue: 1 } },
        { new: true, upsert: true }
      ).lean();
      ticketNumber = counter.sequenceValue.toString();
    }

    // Prepare new Post object
    const newPost = new eventPosts({
      eventId,
      postById,
      postByName,
      postType,
      postUrl,
      postKey,
      postWebpUrl,
      postWebpKey,
      ...(postType === "luckyDraw" && { ticketNumber }),
      ...(postType === "postBadge" && {
        badgeId,
        taggedUserIds: Array.isArray(taggedUserIds)
          ? taggedUserIds
          : taggedUserIds
          ? [taggedUserIds]
          : [],
      }),
    });

    await newPost.save();

    // Response object
    const responseData = {
      _id: newPost._id,
      eventId: newPost.eventId,
      postById: newPost.postById,
      postByName: newPost.postByName,
      postUrl: newPost.postUrl,
      postWebpUrl: newPost.postWebpUrl,
      postType: newPost.postType,
      ...(ticketNumber && { ticketNumber }),
      ...(badgeId && { badgeId }),
      createdAt: newPost.createdAt,
    };

    return sendResponse(
      res,
      200,
      false,
      "Post uploaded successfully",
      responseData
    );
  } catch (err) {
    console.error("Upload Post Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get all posts for an event
router.get("/event-posts/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    const posts = await eventPosts
      .find({ eventId })
      .sort({ createdAt: -1 }) // latest first
      .lean();

    return sendResponse(res, 200, false, "Posts fetched successfully", posts);
  } catch (err) {
    console.error("Get Posts Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

router.post("/:postId/like", async (req, res) => {
  try {
    const { postId } = req.params;
    const { likedById, likedByName } = req.body;

    if (!likedById || !likedByName) {
      return res
        .status(400)
        .json({ message: "likedById and likedByName are required" });
    }

    const post = await eventPosts.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const existingLike = await postLikes.findOne({ postId, likedById });

    if (existingLike) {
      // 👉 Already liked → Unlike it
      await postLikes.findByIdAndDelete(existingLike._id);

      // Decrement like count safely
      post.likeCounts = Math.max(0, (post.likeCounts || 0) - 1);
      await post.save();

      return res.status(200).json({
        message: "Post unliked successfully",
        action: "unliked",
        likeCounts: post.likeCounts,
      });
    } else {
      // 👉 Not liked → Add new like
      const newLike = new postLikes({ postId, likedById, likedByName });
      await newLike.save();

      // Increment like count
      post.likeCounts = (post.likeCounts || 0) + 1;
      await post.save();

      return res.status(201).json({
        message: "Post liked successfully",
        action: "liked",
        likeCounts: post.likeCounts,
        like: newLike,
      });
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:postId/comment", async (req, res) => {
  try {
    const { postId } = req.params;
    const { commentedById, commentedByName, commentTitle } = req.body;

    if (!commentedById || !commentedByName || !commentTitle) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Check if post exists
    const post = await eventPosts.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // ✅ Create new comment
    const newComment = new postComment({
      postId,
      commentedById,
      commentedByName,
      commentTitle,
    });

    await newComment.save();

    // Increment comment count
    post.commentCounts = (post.commentCounts || 0) + 1;
    await post.save();

    res.status(201).json({
      message: "Comment added successfully",
      comment: newComment,
      commentCounts: post.commentCounts,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Function to delete image from S3
const deleteImageFromS3 = async (key) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    };
    await s3.deleteObject(params).promise();
    console.log(`Successfully deleted S3 object: ${key}`);
  } catch (err) {
    console.error("S3 Delete Error:", {
      message: err.message,
      stack: err.stack,
      key,
    });
    throw err;
  }
};

const deleteFileWithRetry = async (filePath, retries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fs.unlink(filePath);
      console.log(`Successfully deleted file: ${filePath}`);
      return;
    } catch (err) {
      console.error(
        `Attempt ${attempt} to delete file ${filePath} failed:`,
        err.message
      );
      if (attempt === retries) {
        console.error(
          `Failed to delete file ${filePath} after ${retries} attempts`
        );
        return; // Don't throw error to avoid interrupting the response
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Save externam template image for an event invite
router.put(
  "/event-invites/external-template/:eventId",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return sendResponse(res, 400, true, err.message);
      next();
    });
  },
  async (req, res) => {
    try {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return sendResponse(res, 400, true, "Invalid event ID");
      }
      const file = req.file;
      const userId = req.body.userId;

      // Validate userId
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid or missing user ID");
      }

      // Find the existing invite
      const existing = await EventInvite.findById(eventId);
      if (!existing) return sendResponse(res, 404, true, "Invite not found");

      // If no file is provided and not clearing, return error
      if (!file && req.body.clearImage !== "true") {
        return sendResponse(
          res,
          400,
          true,
          "External template image is required or set clearImage to true"
        );
      }

      // Handle image upload
      if (file) {
        // Delete existing external template image from S3 if it exists
        if (existing.externalTemplateImageKey) {
          await deleteFromS3(existing.externalTemplateImageKey);
        }

        // Generate unique filename for WebP
        const webpFileName = `external-template-${Date.now()}.webp`;
        const webpPath = file.path.replace(/\.(png|jpeg|jpg)$/i, "") + ".webp";

        // Generate WebP image
        await generateTemplateThumbnail(file.path, webpPath);

        // Upload WebP image to S3
        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          userId,
          eventId,
          "image/webp",
          "event-invites"
        );

        // Update document with new image details
        existing.externalTemplateImageUrl = uploadResult.Location;
        existing.externalTemplateImageKey = uploadResult.Key;
        existing.templateId = null; // Set templateId to null

        // Cleanup local files with retry
        await Promise.all([
          deleteFileWithRetry(file.path),
          deleteFileWithRetry(webpPath),
        ]);
      } else if (req.body.clearImage === "true") {
        // Clear existing image if clearImage is true
        if (existing.externalTemplateImageKey) {
          await deleteFromS3(existing.externalTemplateImageKey);
          existing.externalTemplateImageUrl = null;
          existing.externalTemplateImageKey = null;
          existing.templateId = null;
        }
      }

      // Save updated document
      const updated = await existing.save();
      return sendResponse(
        res,
        200,
        false,
        "External template image updated successfully",
        updated
      );
    } catch (err) {
      console.error("Update External Template Image Error:", {
        message: err.message,
        stack: err.stack,
        eventId: req.params.eventId,
        requestBody: req.body,
      });
      return sendResponse(res, 500, true, "Server error");
    }
  }
);

// Create a lucky draw by event ID and user ID
router.put(
  "/event-images/:eventId/lucky-draw",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return sendResponse(res, 400, true, err.message);
      next();
    });
  },
  async (req, res) => {
    try {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return sendResponse(res, 400, true, "Invalid event ID");
      }

      const file = req.file;
      if (!file) {
        return sendResponse(res, 400, true, "luckyDrawImage is required");
      }

      const userName = req.body.name;
      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          name: userName,
          luckyDrawImages: [],
          thankYouNoteImages: [],
          selfUploadedImages: [],
        });
      } else {
        console.log(
          "Found existing eventImage for eventId:",
          eventId,
          "userId:",
          userId
        );
      }

      const counter = await TicketCounter.findOneAndUpdate(
        { _id: "luckyDrawCounter" },
        { $inc: { sequenceValue: 1 } },
        { new: true, upsert: true }
      ).lean();

      // Generated ticket number
      const ticketNumber = counter.sequenceValue;

      const fileName = `lucky-draw-${Date.now()}-${file.originalname
        .split(".")
        .pop()}`;
      const thumbnailFileName = `thumb_${fileName.replace(
        /\.(png|jpeg|jpg)$/i,
        ""
      )}.webp`;
      const thumbnailPath =
        file.path.replace(/\.(png|jpeg|jpg)$/i, "") + "_thumbnail.webp";

      // Generate thumbnail
      await generateThumbnail(file.path, thumbnailPath);

      // Upload original image and thumbnail concurrently
      const [uploadResult, thumbnailUploadResult] = await Promise.all([
        uploadImageToS3(
          file.path,
          fileName,
          userId,
          eventId,
          file.mimetype,
          "lucky-draw"
        ),
        uploadImageToS3(
          thumbnailPath,
          thumbnailFileName,
          userId,
          eventId,
          "image/webp",
          "lucky-draw"
        ),
      ]);

      // Cleanup local files
      try {
        await Promise.all([fs.unlink(file.path), fs.unlink(thumbnailPath)]);
      } catch (cleanupErr) {
        console.error("Error cleaning up local files:", cleanupErr.message);
      }

      const newImage = {
        _id: new mongoose.Types.ObjectId(),
        name: userName,
        userId: userId,
        ticketNumber,
        luckyDrawImageUrl: uploadResult.Location,
        luckyDrawImageKey: uploadResult.Key,
        luckyDrawThumbnailUrl: thumbnailUploadResult.Location,
        luckyDrawThumbnailKey: thumbnailUploadResult.Key,
        imageType: "luckyDraw",
      };

      eventImage.luckyDrawImages.push(newImage);
      await eventImage.save();

      // Construct response with only the newly uploaded image
      const responseImage = {
        _id: newImage._id,
        userId: eventImage.userId,
        name: userName,
        imageUrl: newImage.luckyDrawImageUrl,
        imageKey: newImage.luckyDrawImageKey,
        webpUrl: newImage.luckyDrawThumbnailUrl,
        webpKey: newImage.luckyDrawThumbnailKey,
        imageType: newImage.imageType,
        createdAt: newImage.createdAt,
      };

      return sendResponse(
        res,
        200,
        false,
        "Lucky draw image uploaded successfully",
        [responseImage]
      );
    } catch (err) {
      console.error("Upload Lucky Draw Image Error:", {
        message: err.message,
        stack: err.stack,
        eventId: req.params.eventId,
      });
      return sendResponse(res, 500, true, "Server error");
    }
  }
);

// Create a thank you note image by event ID and user ID
router.put(
  "/event-images/:eventId/thankyou-note",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return sendResponse(res, 400, true, err.message);
      next();
    });
  },
  async (req, res) => {
    try {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return sendResponse(res, 400, true, "Invalid event ID");
      }

      const file = req.file;
      if (!file) {
        return sendResponse(res, 400, true, "thankYouNoteImage is required");
      }

      const userName = req.body.name;
      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          name: userName,
          luckyDrawImages: [],
          thankYouNoteImages: [],
          selfUploadedImages: [],
        });
        console.log(
          "Created new eventImage for eventId:",
          eventId,
          "userId:",
          userId
        );
      } else {
        console.log(
          "Found existing eventImage for eventId:",
          eventId,
          "userId:",
          userId
        );
      }

      const fileName = `thankyou-note-${Date.now()}-${file.originalname
        .split(".")
        .pop()}`;
      const thumbnailFileName = `thumb_${fileName.replace(
        /\.(png|jpeg|jpg)$/i,
        ""
      )}.webp`;
      const thumbnailPath =
        file.path.replace(/\.(png|jpeg|jpg)$/i, "") + "_thumbnail.webp";

      // Generate thumbnail
      await generateThumbnail(file.path, thumbnailPath);

      // Upload original image and thumbnail concurrently
      const [uploadResult, thumbnailUploadResult] = await Promise.all([
        uploadImageToS3(
          file.path,
          fileName,
          userId,
          eventId,
          file.mimetype,
          "thankyou-note"
        ),
        uploadImageToS3(
          thumbnailPath,
          thumbnailFileName,
          userId,
          eventId,
          "image/webp",
          "thankyou-note"
        ),
      ]);

      // ✅ Cleanup local files
      try {
        const deleteFiles = [];

        // Delete main uploaded file
        if (file.path) deleteFiles.push(fsPromises.unlink(file.path));

        // Delete generated thumbnail if exists
        if (thumbnailPath) {
          try {
            await fsPromises.access(thumbnailPath); // check if exists
            deleteFiles.push(fsPromises.unlink(thumbnailPath));
          } catch {}
        }
        await Promise.all(deleteFiles);
        console.log("Local temp files deleted successfully");
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr.message);
      }

      const newImage = {
        _id: new mongoose.Types.ObjectId(),
        name: userName,
        userId: userId,
        thankYouNoteImageUrl: uploadResult.Location,
        thankYouNoteImageKey: uploadResult.Key,
        thankYouNoteThumbnailUrl: thumbnailUploadResult.Location,
        thankYouNoteThumbnailKey: thumbnailUploadResult.Key,
      };

      eventImage.thankYouNoteImages.push(newImage);
      await eventImage.save();

      // Construct response with only the newly uploaded image
      const responseImage = {
        _id: newImage._id,
        userId: eventImage.userId,
        name: userName,
        imageUrl: newImage.thankYouNoteImageUrl,
        imageKey: newImage.thankYouNoteImageKey,
        webpUrl: newImage.thankYouNoteThumbnailUrl,
        webpKey: newImage.thankYouNoteThumbnailKey,
        imageType: newImage.imageType,
        createdAt: newImage.createdAt,
      };

      return sendResponse(
        res,
        200,
        false,
        "Thank you note image uploaded successfully",
        [responseImage]
      );
    } catch (err) {
      console.error("Upload Thank You Note Image Error:", {
        message: err.message,
        stack: err.stack,
        eventId: req.params.eventId,
      });
      return sendResponse(res, 500, true, "Server error");
    }
  }
);

// Upload self-uploaded images/videos for an event by eventId and userId
router.put(
  "/event-images/:eventId/self-uploaded",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return sendResponse(res, 400, true, err.message);
      next();
    });
  },
  async (req, res) => {
    try {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return sendResponse(res, 400, true, "Invalid event ID");
      }

      const file = req.file;
      if (!file) {
        return sendResponse(res, 400, true, "selfUploadedImage is required");
      }

      const userName = req.body.name;
      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          name: userName,
          luckyDrawImages: [],
          thankYouNoteImages: [],
          selfUploadedImages: [],
        });
      }

      const fileExt = file.originalname.split(".").pop();
      const fileName = `self-uploaded-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}.${fileExt}`;

      let thumbnailFileName = null;
      let thumbnailPath = null;
      let thumbnailUploadResult = null;

      // ✅ Image thumbnail
      if (file.mimetype.startsWith("image/")) {
        thumbnailFileName = `thumb_${fileName.replace(/\.[^.]+$/, "")}.webp`;
        thumbnailPath = file.path.replace(/\.[^.]+$/, "") + "_thumbnail.webp";

        await generateThumbnail(file.path, thumbnailPath);
      }

      // ✅ Video preview (3-4 sec) + compressed version
      if (file.mimetype.startsWith("video/")) {
        thumbnailFileName = `thumb_${fileName.replace(/\.[^.]+$/, ".mp4")}`;
        thumbnailPath = file.path.replace(/\.[^.]+$/, "_thumbnail.mp4");

        try {
          await generateVideoPreview(file.path, thumbnailPath, 4, 0);
        } catch (videoErr) {
          console.error("Video preview generation failed:", videoErr);
        }

        // // ✅ Generate compressed version
        // try {
        //   const compressedFileName = `compressed_${fileName}`;
        //   const compressedPath = file.path.replace(
        //     /\.[^.]+$/,
        //     "_compressed.mp4"
        //   );

        //   console.log("Compressing video...");
        //   await compressVideo(file.path, compressedPath, 28); // lower CRF = better quality, higher = smaller

        //   // Upload compressed file
        //   const compressedUploadResult = await uploadImageToS3(
        //     compressedPath,
        //     compressedFileName,
        //     userId,
        //     eventId,
        //     "video/mp4",
        //     "self-uploaded"
        //   );

        //   // Attach compressed video info for saving later
        //   req.compressedUploadResult = compressedUploadResult;
        //   req.compressedPath = compressedPath;
        // } catch (compErr) {
        //   console.error("❌ Video compression failed:", compErr);
        // }
      }

      // ✅ Upload main file (image/video)
      const uploadResult = await uploadImageToS3(
        file.path,
        fileName,
        userId,
        eventId,
        file.mimetype,
        "self-uploaded"
      );

      // ✅ Upload thumbnail if exists
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        thumbnailUploadResult = await uploadImageToS3(
          thumbnailPath,
          thumbnailFileName,
          userId,
          eventId,
          file.mimetype.startsWith("video/") ? "video/mp4" : "image/webp",
          "self-uploaded"
        );
      }

      // ✅ Cleanup local files
      try {
        const deleteFiles = [];

        // Delete main uploaded file
        if (file.path) deleteFiles.push(fsPromises.unlink(file.path));

        // Delete generated thumbnail if exists
        if (thumbnailPath) {
          try {
            await fsPromises.access(thumbnailPath); // check if exists
            deleteFiles.push(fsPromises.unlink(thumbnailPath));
          } catch {}
        }

        // if (req.compressedPath) {
        //   try {
        //     await fsPromises.access(req.compressedPath);
        //     deleteFiles.push(fsPromises.unlink(req.compressedPath));
        //   } catch {}
        // }

        await Promise.all(deleteFiles);
        console.log("Local temp files deleted successfully");
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr.message);
      }

      // ✅ Build new image/video object
      const newImage = {
        _id: new mongoose.Types.ObjectId(),
        name: userName,
        userId: userId,
        selfUploadedImageUrl: uploadResult.Location,
        selfUploadedImageKey: uploadResult.Key,
        selfUploadedThumbnailUrl: thumbnailUploadResult
          ? thumbnailUploadResult.Location
          : null,
        selfUploadedThumbnailKey: thumbnailUploadResult
          ? thumbnailUploadResult.Key
          : null,
        // selfUploadedCompressedUrl: req.compressedUploadResult
        //   ? req.compressedUploadResult.Location
        //   : null,
        // selfUploadedCompressedKey: req.compressedUploadResult
        //   ? req.compressedUploadResult.Key
        //   : null,
      };

      // Add to the document's selfUploadedImages array
      eventImage.selfUploadedImages.push(newImage);
      await eventImage.save();

      // Construct response with only the newly uploaded image
      const responseImage = {
        _id: newImage._id,
        userId: eventImage.userId,
        name: userName,
        imageUrl: newImage.selfUploadedImageUrl,
        imageKey: newImage.selfUploadedImageKey,
        webpUrl: newImage.selfUploadedThumbnailUrl,
        webpKey: newImage.selfUploadedThumbnailKey,
        imageType: "selfUploaded",
        createdAt: newImage.createdAt,
      };

      // Return only the new image in an array
      return sendResponse(
        res,
        200,
        false,
        "Self-uploaded file uploaded successfully",
        [responseImage] // Return as an array
      );
    } catch (err) {
      console.error("Upload Error:", err);
      return sendResponse(res, 500, true, "Server error");
    }
  }
);

// Delete an image by eventId, userId, imageId, and imageType
router.post("/event-images/:eventId/delete", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId, imageId, imageType } = req.body;

    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    // Validate imageId
    if (!imageId || !mongoose.Types.ObjectId.isValid(imageId)) {
      return sendResponse(res, 400, true, "Invalid image ID");
    }

    // Validate imageType
    const validTypes = ["luckyDraw", "thankYouNote", "selfUploaded"];
    if (!imageType || !validTypes.includes(imageType)) {
      return sendResponse(res, 400, true, "Invalid image type");
    }

    // Find the eventImage document
    const eventImage = await EventImages.findOne({ eventId, userId });
    if (!eventImage) {
      return sendResponse(
        res,
        404,
        true,
        "Event images not found for this user"
      );
    }

    let arrayField;
    let keyField;
    let thumbnailKeyField;
    switch (imageType) {
      case "luckyDraw":
        arrayField = "luckyDrawImages";
        keyField = "luckyDrawImageKey";
        thumbnailKeyField = "luckyDrawThumbnailKey";
        break;
      case "thankYouNote":
        arrayField = "thankYouNoteImages";
        keyField = "thankYouNoteImageKey";
        thumbnailKeyField = "thankYouNoteThumbnailKey";
        break;
      case "selfUploaded":
        arrayField = "selfUploadedImages";
        keyField = "selfUploadedImageKey";
        thumbnailKeyField = "selfUploadedThumbnailKey";
        break;
    }

    // Find the index of the image in the array
    const index = eventImage[arrayField].findIndex(
      (img) => img._id.toString() === imageId
    );
    if (index === -1) {
      return sendResponse(res, 404, true, "Image not found");
    }

    // Get the image details for S3 deletion
    const imageToDelete = eventImage[arrayField][index];
    const imageKey = imageToDelete[keyField];
    const thumbnailKey = imageToDelete[thumbnailKeyField];

    // Delete both original image and thumbnail from S3
    await Promise.all([
      deleteImageFromS3(imageKey),
      deleteImageFromS3(thumbnailKey),
    ]);

    // Remove the image object from the array
    eventImage[arrayField].splice(index, 1);

    // Save the updated document
    const updatedEventImage = await eventImage.save();

    // Delete document if all arrays are empty
    if (
      eventImage.luckyDrawImages.length === 0 &&
      eventImage.thankYouNoteImages.length === 0 &&
      eventImage.selfUploadedImages.length === 0
    ) {
      await eventImage.deleteOne();
    }

    return sendResponse(
      res,
      200,
      false,
      "Image deleted successfully",
      updatedEventImage
    );
  } catch (err) {
    console.error("Delete Image Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.eventId,
      userId: req.body.userId,
      imageId: req.body.imageId,
      imageType: req.body.imageType,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch all images for an event by eventId
router.get("/event-images/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    // Fetch the EventInvite for the eventId to get host details
    const eventInvite = await EventInvite.findById(eventId).lean();
    let hostUserId = null;
    let hostName = null;
    if (eventInvite) {
      hostUserId = eventInvite.userId;
      hostName = eventInvite.hostName; // Assuming hostName field exists
    }

    // Fetch all EventGuest for the eventId and create a map of userId to name
    const eventGuests = await EventGuest.find({ eventId }).lean();
    const guestMap = new Map();
    for (const guest of eventGuests) {
      guestMap.set(guest.userId.toString(), guest.name); // Assuming name field exists
    }

    // Fetch all documents for the given eventId with optimized query
    const eventImagesList = await EventImages.find({ eventId }).lean();

    if (!eventImagesList || eventImagesList.length === 0) {
      return sendResponse(res, 404, true, "No images found for this event");
    }

    // Combine all images into a single array with userId and name
    const allImages = [];
    for (const doc of eventImagesList) {
      const currentUserId = doc.userId.toString();
      let userName = ""; // Default

      // Determine userName
      if (hostUserId && currentUserId === hostUserId.toString()) {
        userName = hostName || "";
      } else if (guestMap.has(currentUserId)) {
        userName = guestMap.get(currentUserId);
      }

      // Add luckyDrawImages
      if (doc.luckyDrawImages && Array.isArray(doc.luckyDrawImages)) {
        for (const image of doc.luckyDrawImages) {
          allImages.push({
            _id: image._id,
            userId: doc.userId,
            name: userName,
            imageUrl: image.luckyDrawImageUrl,
            imageKey: image.luckyDrawImageKey,
            webpUrl: image.luckyDrawThumbnailUrl,
            webpKey: image.luckyDrawThumbnailKey,
            imageType: image.imageType || "luckyDraw",
            createdAt: image.createdAt,
          });
        }
      }

      // Add thankYouNoteImages
      if (doc.thankYouNoteImages && Array.isArray(doc.thankYouNoteImages)) {
        for (const image of doc.thankYouNoteImages) {
          allImages.push({
            _id: image._id,
            userId: doc.userId,
            name: userName,
            imageUrl: image.thankYouNoteImageUrl,
            imageKey: image.thankYouNoteImageKey,
            webpUrl: image.thankYouNoteThumbnailUrl,
            webpKey: image.thankYouNoteThumbnailKey,
            imageType: image.imageType || "thankYouNote",
            createdAt: image.createdAt,
          });
        }
      }

      // Add selfUploadedImages
      if (doc.selfUploadedImages && Array.isArray(doc.selfUploadedImages)) {
        for (const image of doc.selfUploadedImages) {
          allImages.push({
            _id: image._id,
            userId: doc.userId,
            name: userName,
            imageUrl: image.selfUploadedImageUrl,
            imageKey: image.selfUploadedImageKey,
            webpUrl: image.selfUploadedThumbnailUrl,
            webpKey: image.selfUploadedThumbnailKey,
            // selfUploadedCompressedUrl: image.selfUploadedCompressedUrl,
            // selfUploadedCompressedKey: image.selfUploadedCompressedKey,
            imageType: image.imageType || "selfUploaded",
            createdAt: image.createdAt,
          });
        }
      }
    }

    allImages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (allImages.length === 0) {
      return sendResponse(res, 404, true, "No images found for this event");
    }

    return sendResponse(
      res,
      200,
      false,
      "Event images fetched successfully",
      allImages
    );
  } catch (err) {
    console.error("Fetch Event Images Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.eventId,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
