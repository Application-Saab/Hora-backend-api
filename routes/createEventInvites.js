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
const sharp = require("sharp");
const { generateThumbnail } = require("../store/multerS3Config");

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;

// Helper: Determine if string is base64 image
function isBase64Image(str) {
  return (
    typeof str === "string" &&
    str.length > 0 &&
    /^data:image\/[a-zA-Z]+;base64,/.test(str)
  );
}

// Helper: Check if the string is a valid S3 URL
function isS3Url(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  const regex = new RegExp(
    `^${S3_BASE_URL}/event-invites/[^/]+/[^/]+\.[a-zA-Z]+$`
  );
  return regex.test(str);
}

// Helper: Upload base64 image to S3
async function uploadBase64ToS3(base64String, userId, eventId) {
  const matches = base64String.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 image format");

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");

  const mimeToExt = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
  };

  const ext = mimeToExt[mimeType] || mimeType.split("/")[1];
  const key = `event-invites/${userId}/${eventId}.${ext}`;

  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentEncoding: "base64",
    ContentType: mimeType,
  };

  await s3.upload(params).promise();
  return { url: `${S3_BASE_URL}/${key}`, key };
}

// Helper: Delete image from S3
async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

// Joi Schema for Validation (used for both POST and PUT)
const eventInviteSchema = Joi.object({
  userId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation"),
  eventType: Joi.string().trim().allow("").optional(),
  hostName: Joi.string().trim().required(),
  eventDate: Joi.date().iso().required(),
  eventTime: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
  hostImage: Joi.string().allow(null).optional(),
});

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

// Reusable Response Helper
const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

// Create event invite with optional base64 image
router.post("/create-event-invite", async (req, res) => {
  try {
    const { error, value } = eventInviteSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    const {
      userId,
      eventType,
      hostName,
      eventDate,
      eventTime,
      location,
      hostImage,
    } = value;

    const lastWonderlandId = await EventInvite.findOne()
      .sort({ wonderland_id: -1 })
      .select("wonderland_id");
    const nextWonderlandId =
      lastWonderlandId && lastWonderlandId.wonderland_id
        ? Number(lastWonderlandId.wonderland_id) + 1
        : 2206;

    const eventInvite = new EventInvite({
      userId,
      eventType,
      hostName,
      eventDate: new Date(eventDate),
      eventTime,
      location,
      wonderland_id: Number(nextWonderlandId),
    });

    // Handle base64 image
    if (hostImage && isBase64Image(hostImage)) {
      const { url, key } = await uploadBase64ToS3(
        hostImage,
        userId,
        eventInvite._id.toString()
      );
      eventInvite.imageUrl = url;
      eventInvite.imageKey = key;
    } else if (hostImage !== null && hostImage !== undefined) {
      return sendResponse(
        res,
        400,
        true,
        "Invalid hostImage format. Must be base64 or null"
      );
    }

    const savedInvite = await eventInvite.save();
    return sendResponse(res, 201, false, "Event invite created", savedInvite);
  } catch (err) {
    console.error("Create Invite Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

// Fetch event invite by ID
router.get("/event-invites/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate eventId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    // Fetch the event invite
    const invite = await EventInvite.findById(id).lean();
    if (!invite) {
      return sendResponse(res, 404, true, "Event invite not found");
    }

    // Extract userId from the invite
    const userId = invite.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid or missing user ID in event invite");
    }

    // Fetch lucky draw images for the user and event
    const eventImage = await EventImages.findOne({ eventId: id, userId }).lean();
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
// Get all events By User ID
router.get("/event-invites/all/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID");
    }

    // Find all events for the given userId
    const events = await EventInvite.find({ userId }).lean();

    if (!events || events.length === 0) {
      return sendResponse(res, 404, false, "No events found for this user", []);
    }

    return sendResponse(res, 200, false, "Events fetched successfully", events);
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
  // Validate ID format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendResponse(res, 400, true, "Invalid event ID");
  }

  try {
    // Validate request body
    const { error, value } = eventInviteSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    // Find the existing invite
    const existing = await EventInvite.findById(id);
    if (!existing) return sendResponse(res, 404, true, "Invite not found");

    const {
      userId,
      eventType,
      hostName,
      eventDate,
      eventTime,
      location,
      hostImage,
    } = value;

    // Handle hostImage
    if (hostImage !== undefined) {
      if (isBase64Image(hostImage)) {
        // Case 1: hostImage is a base64 string
        if (existing.imageKey) {
          await deleteFromS3(existing.imageKey);
        }
        const { url, key } = await uploadBase64ToS3(hostImage, userId, id);
        existing.imageUrl = url;
        existing.imageKey = key;
      } else if (hostImage === null) {
        // Case 2: hostImage is null, clear the image
        if (existing.imageKey) {
          await deleteFromS3(existing.imageKey);
          existing.imageUrl = null;
          existing.imageKey = null;
        }
      } else if (isS3Url(hostImage)) {
        console.log("hostImage is an S3 URL, no update required:", hostImage);
      } else {
        return sendResponse(
          res,
          400,
          true,
          "Invalid hostImage format. Must be base64, null, or a valid S3 URL"
        );
      }
    }

    // Update other fields
    if (eventType !== undefined) existing.eventType = eventType;
    if (hostName !== undefined) existing.hostName = hostName;
    if (eventDate !== undefined) existing.eventDate = new Date(eventDate);
    if (eventTime !== undefined) existing.eventTime = eventTime;
    if (location !== undefined) existing.location = location;

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

// Create A guest for an event
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

    // Find the guest details by userId (assuming userId is the same as guestId in EventGuest)
    const guest = await EventGuest.findOne({ userId, eventId }).lean();
    if (!guest) {
      return sendResponse(res, 404, false, "User not found", null);
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

// Get all guests by event id
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

// Update RSVP status or name of a guest
router.put("/event-guest", async (req, res) => {
  try {
    const { eventId, userId, name, rsvpStatus } = req.body;

    // Validate the input
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

    // Find guest by eventId and userId combination
    const updatedGuest = await EventGuest.findOne({ eventId, userId });
    if (!updatedGuest) {
      return sendResponse(res, 404, true, "Guest not found");
    }

    // Update guest fields
    let updateData = {};
    if (name !== undefined) updateData.name = name;
    if (rsvpStatus !== undefined) updateData.rsvpStatus = rsvpStatus;

    // If name is provided, update the corresponding user
    if (name !== undefined) {
      const User = require("../models/user");
      const user = await User.findById(updatedGuest.userId);
      if (user) {
        user.name = name; // Update user's name
        await user.save();
      }
    }

    // Update guest document
    Object.assign(updatedGuest, updateData);
    const savedGuest = await updatedGuest.save();

    return sendResponse(
      res,
      200,
      false,
      "Guest updated successfully",
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

// Temporary storage for uploaded files
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single("image"); // Single file upload for luckyDraw and thankYouNote

const uploadMultiple = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).array("selfUploadedImages", 10); // Multiple files, max 10

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

// PUT /event-images/:eventId/lucky-draw
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

      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          userType: "guest",
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

      const ticketNumber = counter.sequenceValue;
      console.log("Generated ticketNumber:", ticketNumber);

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
        ticketNumber,
        luckyDrawImageUrl: uploadResult.Location,
        luckyDrawImageKey: uploadResult.Key,
        luckyDrawThumbnailUrl: thumbnailUploadResult.Location,
        luckyDrawThumbnailKey: thumbnailUploadResult.Key,
        imageType: "luckyDraw",
        createdAt: new Date(),
      };

      eventImage.luckyDrawImages.push(newImage);
      const updatedEventImage = await eventImage.save();
      console.log("Saved eventImage:", updatedEventImage);

      return sendResponse(
        res,
        200,
        false,
        "Lucky draw image uploaded successfully",
        updatedEventImage
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

// PUT /event-images/:eventId/thankyou-note
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

      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          userType: "guest",
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

      // Cleanup local files
      try {
        await Promise.all([fs.unlink(file.path), fs.unlink(thumbnailPath)]);
      } catch (cleanupErr) {
        console.error("Error cleaning up local files:", cleanupErr.message);
      }

      const newImage = {
        _id: new mongoose.Types.ObjectId(),
        thankYouNoteImageUrl: uploadResult.Location,
        thankYouNoteImageKey: uploadResult.Key,
        thankYouNoteThumbnailUrl: thumbnailUploadResult.Location,
        thankYouNoteThumbnailKey: thumbnailUploadResult.Key,
        imageType: "thankYouNote",
      };

      eventImage.thankYouNoteImages.push(newImage);
      const updatedEventImage = await eventImage.save();
      console.log("Saved eventImage:", updatedEventImage);

      return sendResponse(
        res,
        200,
        false,
        "Thank you note image uploaded successfully",
        updatedEventImage
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

// PUT /event-images/:eventId/self-uploaded
router.put(
  "/event-images/:eventId/self-uploaded",
  (req, res, next) => {
    uploadMultiple(req, res, (err) => {
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

      const files = req.files;
      if (!files || files.length === 0) {
        return sendResponse(res, 400, true, "selfUploadedImages are required");
      }

      const userId = req.body.userId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid user ID");
      }

      let eventImage = await EventImages.findOne({ eventId, userId });
      if (!eventImage) {
        eventImage = new EventImages({
          eventId,
          userId,
          userType: "guest",
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

      const newImages = await Promise.all(
        files.map(async (file) => {
          const fileName = `self-uploaded-${Date.now()}-${file.originalname
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
              "self-uploaded"
            ),
            uploadImageToS3(
              thumbnailPath,
              thumbnailFileName,
              userId,
              eventId,
              "image/webp",
              "self-uploaded"
            ),
          ]);

          // Cleanup local files
          try {
            await Promise.all([fs.unlink(file.path), fs.unlink(thumbnailPath)]);
          } catch (cleanupErr) {
            console.error("Error cleaning up local files:", cleanupErr.message);
          }

          return {
            _id: new mongoose.Types.ObjectId(),
            selfUploadedImageUrl: uploadResult.Location,
            selfUploadedImageKey: uploadResult.Key,
            selfUploadedThumbnailUrl: thumbnailUploadResult.Location,
            selfUploadedThumbnailKey: thumbnailUploadResult.Key,
            imageType: "selfUploaded",
          };
        })
      );

      eventImage.selfUploadedImages.push(...newImages);
      const updatedEventImage = await eventImage.save();

      return sendResponse(
        res,
        200,
        false,
        "Self-uploaded images uploaded successfully",
        updatedEventImage
      );
    } catch (err) {
      console.error("Upload Self-Uploaded Images Error:", {
        message: err.message,
        stack: err.stack,
        eventId: req.params.eventId,
      });
      return sendResponse(res, 500, true, "Server error");
    }
  }
);

// POST /event-images/:eventId/delete

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

    const response = {
      error: false,
      message: "Image deleted successfully",
      data: updatedEventImage,
    };
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

// GET /event-images/:eventId
// router.get("/event-images/:eventId", async (req, res) => {
//   try {
//     const { eventId } = req.params;

//     // Validate eventId
//     if (!mongoose.Types.ObjectId.isValid(eventId)) {
//       return sendResponse(res, 400, true, "Invalid event ID");
//     }

//     // Fetch all documents for the given eventId with optimized query
//     const eventImagesList = await EventImages.find({ eventId }).lean();

//     if (!eventImagesList || eventImagesList.length === 0) {
//       return sendResponse(res, 404, true, "No images found for this event");
//     }

//     // Combine all images into a single array with userId
//     const allImages = [];
//     for (const doc of eventImagesList) {
//       // Add luckyDrawImages
//       if (doc.luckyDrawImages && Array.isArray(doc.luckyDrawImages)) {
//         for (const image of doc.luckyDrawImages) {
//           allImages.push({
//             _id: image._id,
//             userId: doc.userId,
//             imageUrl: image.luckyDrawImageUrl,
//             imageKey: image.luckyDrawImageKey,
//             webpUrl: image.luckyDrawThumbnailUrl,
//             webpKey: image.luckyDrawThumbnailKey,
//             imageType: image.imageType || "luckyDraw",
//             createdAt: image.createdAt,
//           });
//         }
//       }

//       // Add thankYouNoteImages
//       if (doc.thankYouNoteImages && Array.isArray(doc.thankYouNoteImages)) {
//         for (const image of doc.thankYouNoteImages) {
//           allImages.push({
//             _id: image._id,
//             userId: doc.userId,
//             imageUrl: image.thankYouNoteImageUrl,
//             imageKey: image.thankYouNoteImageKey,
//             webpUrl: image.thankYouNoteThumbnailUrl,
//             webpKey: image.thankYouNoteThumbnailKey,
//             imageType: image.imageType || "thankYouNote",
//             createdAt: image.createdAt,
//           });
//         }
//       }

//       // Add selfUploadedImages
//       if (doc.selfUploadedImages && Array.isArray(doc.selfUploadedImages)) {
//         for (const image of doc.selfUploadedImages) {
//           allImages.push({
//             _id: image._id,
//             userId: doc.userId,
//             imageUrl: image.selfUploadedImageUrl,
//             imageKey: image.selfUploadedImageKey,
//             webpUrl: image.selfUploadedThumbnailUrl,
//             webpKey: image.selfUploadedThumbnailKey,
//             imageType: image.imageType || "selfUploaded",
//             createdAt: image.createdAt,
//           });
//         }
//       }
//     }

//     allImages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

//     if (allImages.length === 0) {
//       return sendResponse(res, 404, true, "No images found for this event");
//     }

//     return sendResponse(
//       res,
//       200,
//       false,
//       "Event images fetched successfully",
//       allImages
//     );
//   } catch (err) {
//     console.error("Fetch Event Images Error:", {
//       message: err.message,
//       stack: err.stack,
//       eventId: req.params.eventId,
//     });
//     return sendResponse(res, 500, true, "Server error");
//   }
// });

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
