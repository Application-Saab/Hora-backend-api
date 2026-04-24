const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const EventInvite = require("../models/event-invite");
const EventGuest = require("../models/event-guest");
const TicketCounter = require("../models/ticket-counter-luckydraw");
const EventImages = require("../models/eventImages");
const EventMessage = require("../models/eventMessage");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  generateTemplateThumbnail,
  generateThumbnail,
} = require("../store/multerS3Config");
const eventPosts = require("../models/event-posts");
const postLikes = require("../models/post-likes");
const postComment = require("../models/post-comment");
const ChatRoom = require("../models/eventChatRoom");
const User = require("../models/user");
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const { getIO } = require("../socket");
const { CustomResponse } = require("../store/commonFunction");

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
// Updated
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

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid userId");
    }

    // Parallel Fetch
    const [user, counter] = await Promise.all([
      User.findById(userId),
      TicketCounter.findOneAndUpdate(
        { _id: "wonderland_event_id" },
        { $inc: { sequenceValue: 1 } },
        { new: true, upsert: true },
      ),
    ]);

    if (!user) {
      return sendResponse(res, 404, true, "User not found");
    }

    // User name logic
    if (!user.name && hostName) {
      user.name = hostName;
      await user.save();
    }

    const finalUserName = user.name || hostName || "";

    // Create event invite
    const event = await EventInvite.create({
      userId,
      eventType,
      hostName: hostName,
      eventDate: eventDate ? new Date(eventDate) : null,
      eventTime,
      location,
      googleMapLink,
      wonderland_id: counter.sequenceValue,
    });

    try {
      // Create host to as guest
      await EventGuest.create({
        userId,
        eventId: event._id,
        name: finalUserName,
        rsvpStatus: "will Come",
        isHost: true,
      });

      // Create chat room according to event
      let room = await ChatRoom.create({
        eventId: event._id,
        roomName: hostName,
        createdBy: userId,
        members: [
          {
            userId,
            name: finalUserName,
            phone: user.phone,
            profileImageUrl: user.avatar,
          },
        ],
      });
      await EventMessage.insertMany([
        {
          groupId: room._id,
          senderId: userId,
          message:
            "Welcome to Wonderland chat — where the fun begins even before the party!",
          type: "text",
          mediaUrl: "",
          senderName: finalUserName || "Wonderland",
          senderPhone: user.phone || "",
        },
        {
          groupId: room._id,
          senderId: userId,
          message: "What’s on your mind? !",
          type: "text",
          mediaUrl: "",
          senderName: finalUserName || "Wonderland",
          senderPhone: user.phone || "",
        },
      ]);
    } catch (innerErr) {
      // If any one operation will fails
      await Promise.all([
        EventGuest.deleteMany({ eventId: event._id }),
        ChatRoom.deleteMany({ eventId: event._id }),
        EventInvite.findByIdAndDelete(event._id),
        EventMessage.deleteMany({ groupId: room._id }),
      ]);

      throw innerErr;
    }

    return sendResponse(res, 201, false, "Event created successfully", event);
  } catch (err) {
    console.error("Create Event Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch event details by eventId(_id)
// Updated
router.get("/event-invites/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    const invite = await EventInvite.findById(id)
      .select(
        "userId eventType hostName eventDate eventTime location googleMapLink externalTemplateImageUrl subFolders",
      )
      .lean();

    if (!invite) {
      return sendResponse(res, 404, true, "Event invite not found");
    }

    return sendResponse(
      res,
      200,
      false,
      "Event invite fetched successfully",
      invite,
    );
  } catch (err) {
    console.error("Fetch Invite Error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.id,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch all event invites for a user as a guest or host
// Updated
router.get("/event-invites/all/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const events = await EventInvite.aggregate([
      // Hosted events
      {
        $match: {
          userId: userObjectId,
          hostName: { $exists: true, $ne: "" },
        },
      },
      {
        $addFields: {
          eventRole: "host",
        },
      },

      // Combine with guest events
      {
        $unionWith: {
          coll: "eventguests",
          pipeline: [
            {
              $match: {
                userId: userObjectId,
              },
            },
            {
              $lookup: {
                from: "eventinvites",
                localField: "eventId",
                foreignField: "_id",
                as: "event",
              },
            },
            { $unwind: "$event" },
            {
              $match: {
                "event.hostName": { $exists: true, $ne: "" },
              },
            },
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: ["$event", { eventRole: "guest" }],
                },
              },
            },
          ],
        },
      },

      // Remoce duplicates if same event is already exists as host
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },

      // Sorting for latest first
      { $sort: { createdAt: -1 } },

      // projection only required fields in response
      {
        $project: {
          hostName: 1,
          eventDate: 1,
          eventRole: 1,
        },
      },
    ]);

    return sendResponse(res, 200, false, "Events fetched successfully", events);
  } catch (err) {
    console.error("Fetch Events Error:", err);
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
      updated,
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

    const { userId, eventId, name, rsvpStatus, phone } = value;

    // Check for existing guest with same userId and eventId
    const existingGuest = await EventGuest.findOne({ userId, eventId }).lean();
    if (existingGuest) {
      return sendResponse(
        res,
        409,
        true,
        "User is already registered for this event",
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
// Updated
router.get("/event-guest/:eventId/user/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    // Validate eventId and userId
    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return sendResponse(res, 400, true, "Invalid eventId or userId");
    }

    // Query to get details
    const guest = await EventGuest.findOne(
      { eventId, userId },
      {
        userId: 1,
        eventId: 1,
        name: 1,
        phone: 1,
        rsvpStatus: 1,
        isHost: 1,
      },
    ).lean();

    if (!guest) {
      return sendResponse(
        res,
        200,
        false,
        "User not registered to this event",
        null,
      );
    }

    return sendResponse(
      res,
      200,
      false,
      "Guest details fetched successfully",
      guest,
    );
  } catch (err) {
    console.error("Fetch Event Guest Error:", err.message);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get all guests details for an event by eventId
// Updated
router.get("/event-guests/all/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    // Get guest using projection to limit fields
    const guests = await EventGuest.find(
      { eventId },
      {
        name: 1,
        rsvpStatus: 1,
        isHost: 1,
        userId: 1,
        eventId: 1,
        phone: 1,
      },
    ).lean();

    return sendResponse(
      res,
      200,
      false,
      "Guests fetched successfully",
      guests || [],
    );
  } catch (err) {
    console.error("Fetch Guests Error:", err.message);
    return sendResponse(res, 500, true, "Server error");
  }
});
// Update guest details for an event
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
      phone: Joi.string().trim().allow("").optional(),
    });

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    // Fix ObjectId validation
    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return sendResponse(res, 400, true, "Invalid event ID or user ID");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, true, "User not found");
    }

    const updatedGuest = await EventGuest.findOne({ eventId, userId });
    if (!updatedGuest) {
      return sendResponse(res, 404, true, "Guest not found");
    }

    let finalName = name || user.name;

    // Update name if provided and different
    if (name && name.trim() !== "" && user.name !== name.trim()) {
      updatedGuest.name = name.trim();
      user.name = name.trim();
      await user.save();
      finalName = name.trim();
    }

    // Update RSVP status
    if (rsvpStatus !== undefined && rsvpStatus !== "") {
      updatedGuest.rsvpStatus = rsvpStatus;
      updatedGuest.name = finalName;
    }

    const savedGuest = await updatedGuest.save();

    // Add to chat room members
    const memberObject = {
      userId,
      name: finalName,
      phone: user.phone || "",
      profileImageUrl: user.avatar || "",
    };

    await ChatRoom.findOneAndUpdate(
      { eventId },
      { $addToSet: { members: memberObject } },
      { upsert: false },
    );
    const ioInstance = getIO();
    const groupRoom = await ChatRoom.findOne({ eventId, roomType: "group" });
    if (groupRoom) {
      const infoMessage = `${finalName} joined the group`;

      const savedInfo = await EventMessage.create({
        groupId: groupRoom._id,
        senderId: userId,
        message: infoMessage,
        type: "info",
        infoType: "user_joined",
        actorId: userId,
        actorSnapshot: {
          name: finalName,
        },
        senderName: finalName,
        senderPhone: user.phone || "",
      });

      // Update lastMessageAt for sorting
      await ChatRoom.findByIdAndUpdate(groupRoom._id, {
        lastMessageAt: savedInfo.createdAt,
      });

      const finalInfoMsg = {
        _id: savedInfo._id,
        groupId: groupRoom._id,
        senderId: userId,
        message: infoMessage,
        type: "info",
        infoType: "user_joined",
        actorId: userId,
        actorSnapshot: {
          name: finalName,
        },
        createdAt: savedInfo.createdAt,
        senderName: finalName,
        senderPhone: user.phone || "",
      };

      ioInstance.to(groupRoom._id.toString()).emit("message:new", finalInfoMsg);
      // ioInstance.to(eventId.toString()).emit("rsvp:update", { eventId });
    }

    return sendResponse(res, 200, false, "Guest updated & added to chat room", {
      ...savedGuest.toObject(),
      groupId: groupRoom ? groupRoom._id : null,
    });
  } catch (err) {
    console.error("Update Guest Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    return sendResponse(res, 500, true, "Server error");
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
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("image");

const uploadSingle2 = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const uploadImageToS3 = async (
  filePath,
  fileName,
  userId,
  eventId,
  mimeType,
  folderName,
) => {
  const params = {
    Bucket: S3_BUCKET,
    Key: `${folderName}/${userId}/${eventId}/${fileName}`,
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
      Bucket: S3_BUCKET,
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
        postType,
      )
    )
      return sendResponse(res, 400, true, "Invalid postType");

    // LuckyDraw ticketNumber handling
    let ticketNumber = null;
    if (postType === "luckyDraw") {
      const counter = await TicketCounter.findOneAndUpdate(
        { _id: "luckyDrawCounter" },
        { $inc: { sequenceValue: 1 } },
        { new: true, upsert: true },
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
      responseData,
    );
  } catch (err) {
    console.error("Upload Post Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get all posts for an event
// router.get("/event-posts/:eventId", async (req, res) => {
//   try {
//     const { eventId } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(eventId)) {
//       return sendResponse(res, 400, true, "Invalid event ID");
//     }

//     const posts = await eventPosts
//       .find({ eventId })
//       .sort({ createdAt: -1 })
//       .lean();

//     return sendResponse(res, 200, false, "Posts fetched successfully", posts);
//   } catch (err) {
//     console.error("Get Posts Error:", err);
//     return sendResponse(res, 500, true, "Server error");
//   }
// });

// router.get("/event-posts/:eventId", async (req, res) => {
//   try {
//     const { eventId } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(eventId)) {
//       return sendResponse(res, 400, true, "Invalid event ID");
//     }

//     // Get page & limit from query
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 25;

//     const skip = (page - 1) * limit;

//     // Get total count
//     const totalPosts = await eventPosts.countDocuments({ eventId });

//     // Fetch paginated posts
//     const posts = await eventPosts
//       .find({ eventId })
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     return sendResponse(res, 200, false, "Posts fetched successfully", {
//       posts,
//       currentPage: page,
//       totalPages: Math.ceil(totalPosts / limit),
//       totalPosts,
//     });

//   } catch (err) {
//     console.error("Get Posts Error:", err);
//     return sendResponse(res, 500, true, "Server error");
//   }
// });

router.get("/event-posts/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    // Fetch all posts without pagination
    const posts = await eventPosts
      .find({ eventId })
      .sort({ createdAt: -1 })
      .lean();

    return sendResponse(res, 200, false, "Posts fetched successfully", {
      posts,
      totalPosts: posts.length,
    });
  } catch (err) {
    console.error("Get Posts Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

router.post("/delete-post/:postId", async (req, res) => {
  const { postId } = req.params;

  try {
    // Find the image in MongoDB
    const image = await eventPosts.findById(postId);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    // Build list of S3 keys to delete
    const keysToDelete = [];

    if (image.postKey) keysToDelete.push({ Key: image.postKey });
    if (image.postWebpKey) keysToDelete.push({ Key: image.postWebpKey });
    // if (image.videoClipKey) keysToDelete.push({ Key: image.videoClipKey });

    if (keysToDelete.length > 0) {
      // await s3
      //   .deleteObjects({
      //     Bucket: process.env.S3_BUCKET_NAME,
      //     Delete: { Objects: keysToDelete },
      //   })
      //   .promise();
      keysToDelete.forEach(async (k) => {
        try {
          await deleteFromS3(k.Key);
        } catch (err) {
          console.error(`Failed to delete ${k.Key} from S3:`, err);
        }
      });
    }

    // Delete document from MongoDB
    await eventPosts.findByIdAndDelete(postId);

    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create Event Subfolder
router.post(
  "/create-event-subfolder/:eventId",
  uploadSingle2.single("file"),
  async (req, res) => {
    try {
      const { eventId } = req.params;

      const { folderName, type, userId, subFolderName } = req.body;

      // ================= VALIDATION =================
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return sendResponse(res, 400, true, "Invalid event ID");
      }

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid userId");
      }

      if (!folderName || !type) {
        return sendResponse(res, 400, true, "folderName and type are required");
      }

      if (!["my_photos", "others"].includes(type)) {
        return sendResponse(res, 400, true, "Invalid folder type");
      }

      // ================= FIND EVENT =================
      const event = await EventInvite.findById(eventId);

      if (!event) {
        return sendResponse(res, 404, true, "Event not found");
      }

      // ================= CHECK DUPLICATE =================
      if (type === "my_photos") {
        const alreadyExists = event.subFolders.some(
          (sf) =>
            sf.userId.toString() === userId.toString() &&
            sf.type === "my_photos",
        );

        if (alreadyExists) {
          return sendResponse(
            res,
            409,
            true,
            "My Photos subfolder already exists",
          );
        }
      }

      let folderDp = {};

      // ================= HANDLE IMAGE =================
      if (req.file) {
        const file = req.file;

        const filePath = file.path;
        const fileName = file.filename;

        const thumbName = `thumb_${fileName}.webp`;
        const thumbPath = path.join(path.dirname(filePath), thumbName);

        try {
          // generate thumbnail
          await generateThumbnail(filePath, thumbPath);

          // upload original
          const originalUpload = await uploadImageToS3(
            filePath,
            fileName,
            userId,
            eventId,
            file.mimetype,
            folderName,
          );

          // upload thumbnail
          const thumbUpload = await uploadImageToS3(
            thumbPath,
            thumbName,
            userId,
            eventId,
            "image/webp",
            folderName,
          );

          folderDp = {
            fileUrl: originalUpload.Location,
            thumbnailUrl: thumbUpload.Location,
            s3Key: originalUpload.Key,
            thumbnailKey: thumbUpload.Key,
          };
        } finally {
          // cleanup
          const paths = [filePath, thumbPath];

          for (const p of paths) {
            if (!p) continue;

            try {
              await fs.promises.unlink(p);
            } catch {}
          }
        }
      }

      // ================= CREATE SUBFOLDER =================
      const newSubFolder = {
        folderName:
          type === "my_photos"
            ? "My Photos"
            : subFolderName || "Untitled Folder",

        type,

        userId,

        folderDp,

        createdAt: new Date(),
      };

      event.subFolders.push(newSubFolder);

      await event.save();

      const savedSubFolder = event.subFolders[event.subFolders.length - 1];

      return sendResponse(
        res,
        201,
        false,
        "Subfolder created successfully",
        savedSubFolder,
      );
    } catch (error) {
      console.error("Create Event Subfolder Error:", error);

      return sendResponse(res, 500, true, "Server error");
    }
  },
);

router.put("/assign-to-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({ message: "subFolderId is required" });
    }

    if (addImageIds.length > 0) {
      await eventPosts.updateMany(
        { _id: { $in: addImageIds } },
        { $addToSet: { folderIds: subFolderId } },
      );
    }

    if (removeImageIds.length > 0) {
      await eventPosts.updateMany(
        { _id: { $in: removeImageIds } },
        { $pull: { folderIds: subFolderId } },
      );
    }

    return res.status(200).json({
      message: "Subfolder updated successfully",
      added: addImageIds.length,
      removed: removeImageIds.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
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
      // If  already liked -> Unlike it
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
      // Not liked -> Add new like
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

    // Check if post exists
    const post = await eventPosts.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Create new comment
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

router.get("/liked-posts/:eventId/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    // ================= VALIDATION =================
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    // ================= STEP 1: GET USER LIKES =================
    const likedPosts = await postLikes
      .find({
        likedById: userId,
      })
      .select("postId")
      .lean();

    if (!likedPosts.length) {
      return res.status(200).json({
        message: "No liked posts found",
        posts: [],
      });
    }

    // ================= STEP 2: UNIQUE POST IDS =================
    const postIds = [...new Set(likedPosts.map((l) => l.postId.toString()))];

    // ================= STEP 3: FILTER BY EVENT =================
    const posts = await eventPosts
      .find({
        _id: { $in: postIds },
        eventId: eventId,
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Liked posts fetched successfully",
      total: posts.length,
      posts,
    });
  } catch (error) {
    console.error("Get liked posts error:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

const deleteFileWithRetry = async (filePath, retries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fs.unlinkSync(filePath);
      console.log(`Successfully deleted file: ${filePath}`);
      return;
    } catch (err) {
      console.error(
        `Attempt ${attempt} to delete file ${filePath} failed:`,
        err.message,
      );
      if (attempt === retries) {
        console.error(
          `Failed to delete file ${filePath} after ${retries} attempts`,
        );
        return; // Don't throw error to avoid interrupting the response
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Save external template image for an event invite
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
          "External template image is required or set clearImage to true",
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
          "event-invites",
        );

        // Update document with new image details
        existing.externalTemplateImageUrl = uploadResult.Location;
        existing.externalTemplateImageKey = uploadResult.Key;
        existing.templateId = null;

        await ChatRoom.findOneAndUpdate(
          { eventId },
          { roomProfileUrl: uploadResult.Location },
        );

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
        updated,
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
  },
);

router.get("/all-tracking", async (req, res) => {
  try {
    const [totalEvents, hostUsers, guestUsersRaw, totalPosts, wonderlandUsers] =
      await Promise.all([
        // Total Events
        EventInvite.countDocuments(),

        // Unique Hosts
        EventInvite.distinct("userId"),

        // Raw Guests (includes self-host guests)
        EventGuest.distinct("userId"),

        // Total Posts
        eventPosts.countDocuments(),

        // Wonderland Users
        User.countDocuments({ fromWonderland: true }),
      ]);

    // Convert host list to Set for fast lookup
    const hostSet = new Set(hostUsers.map(String));

    // Filter guests (remove self-host cases)
    const filteredGuestUsers = guestUsersRaw.filter(
      (userId) => !hostSet.has(String(userId)),
    );

    // Unique Guests Count
    const totalGuests = filteredGuestUsers.length;

    // UNIQUE USERS (host + guest but without duplication)
    const uniqueUsersSet = new Set([
      ...hostUsers.map(String),
      ...filteredGuestUsers.map(String),
    ]);

    const totalUniqueEventUsers = uniqueUsersSet.size;

    return res.status(200).json({
      success: true,
      message: "Global dashboard stats fetched successfully",
      data: {
        totalEvents,
        totalHosts: hostUsers.length,
        totalGuests,
        totalPosts,
        totalWonderlandUsers: wonderlandUsers,
        totalUniqueEventUsers,
      },
    });
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});
const getDateFilter = (dateFilter) => {
  const now = new Date();

  switch (dateFilter) {
    case "last_1_week":
      return new Date(now.setDate(now.getDate() - 7));
    case "last_1_month":
      return new Date(now.setMonth(now.getMonth() - 1));
    case "last_1_year":
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return null;
  }
};

router.post("/admin_all_details", async (req, res) => {
  try {
    const { type, page, per_page, search, dateFilter } = req.body;

    const currentPage = parseInt(page) || 1;
    const limit = parseInt(per_page) || 10;
    const skip = (currentPage - 1) * limit;

    const date = getDateFilter(dateFilter);

    let data = [];
    let total = 0;

    // By Users handler
    if (type === "byUsers") {
      // Pre-aggregate counts
      const [hostedMap, guestMap, postsMap] = await Promise.all([
        EventInvite.aggregate([
          ...(date ? [{ $match: { createdAt: { $gte: date } } }] : []),
          {
            $group: {
              _id: "$userId",
              count: { $sum: 1 },
            },
          },
        ]),

        EventGuest.aggregate([
          {
            $group: {
              _id: "$userId",
              count: { $sum: 1 },
            },
          },
        ]),

        eventPosts.aggregate([
          {
            $group: {
              _id: "$postById",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      // Convert to map for unique data
      const hostedObj = Object.fromEntries(
        hostedMap.map((i) => [i._id.toString(), i.count]),
      );

      const guestObj = Object.fromEntries(
        guestMap.map((i) => [i._id.toString(), i.count]),
      );

      const postsObj = Object.fromEntries(
        postsMap.map((i) => [i._id.toString(), i.count]),
      );

      // Fetch users
      let userQuery = {};

      if (search) {
        userQuery.phone = { $regex: search, $options: "i" };
      }

      const users = await User.find(userQuery)
        .select("name phone fromWonderland createdAt")
        .sort({ createdAt: -1 });

      // Attach counts + filter
      const enrichedUsers = users
        .map((user) => {
          const id = user._id.toString();

          return {
            name: user.name,
            phone: user.phone,
            fromWonderland: user.fromWonderland,
            hostedEventsCount: hostedObj[id] || 0,
            guestEventsCount: guestObj[id] || 0,
            postsCount: postsObj[id] || 0,
            createdAt: user.createdAt,
          };
        })
        .filter(
          (u) =>
            u.hostedEventsCount > 0 ||
            u.guestEventsCount > 0 ||
            u.fromWonderland,
        );

      // Pagination AFTER filter
      total = enrichedUsers.length;

      data = enrichedUsers.slice(skip, skip + limit);
    }

    // By Users
    else if (type === "byEvents") {
      const matchStage = {};

      if (date) {
        matchStage.createdAt = { $gte: date };
      }

      if (search) {
        matchStage.hostName = { $regex: search, $options: "i" };
      }

      const pipeline = [
        { $match: matchStage },

        // Host User
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "hostUser",
          },
        },
        { $unwind: { path: "$hostUser", preserveNullAndEmptyArrays: true } },

        // Guests Count (excluding host)
        {
          $lookup: {
            from: "eventguests",
            let: { eventId: "$_id", hostId: "$userId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$eventId", "$$eventId"] },
                      { $ne: ["$userId", "$$hostId"] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "guestData",
          },
        },

        // Posts Count
        {
          $lookup: {
            from: "event-posts",
            let: { eventId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$eventId", "$$eventId"] },
                },
              },
              { $count: "count" },
            ],
            as: "postData",
          },
        },

        {
          $addFields: {
            guestCount: {
              $ifNull: [{ $arrayElemAt: ["$guestData.count", 0] }, 0],
            },
            photoCount: {
              $ifNull: [{ $arrayElemAt: ["$postData.count", 0] }, 0],
            },
            hostPhone: "$hostUser.phone",
            hostCount: 1,
          },
        },

        {
          $project: {
            wonderland_id: 1,
            hostName: 1,
            hostPhone: 1,
            eventDate: 1,
            guestCount: 1,
            photoCount: 1,
            hostCount: 1,
            createdAt: 1,
          },
        },

        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ];

      data = await EventInvite.aggregate(pipeline);
      total = await EventInvite.countDocuments(matchStage);
    }

    // Pagination
    const lastPage = Math.ceil(total / limit) || 1;

    const paginate = {
      total_item: total,
      showing: data.length,
      first_page: 1,
      previous_page: currentPage > 1 ? currentPage - 1 : 1,
      current_page: currentPage,
      next_page: currentPage < lastPage ? currentPage + 1 : lastPage,
      last_page: lastPage,
    };

    return CustomResponse(res, 200, false, "Data fetched successfully", {
      data,
      paginate,
    });
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
