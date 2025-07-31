const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const AWS = require("aws-sdk");
const EventInvite = require("../models/event-invite");

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
  return typeof str === "string" && str.length > 0 && /^data:image\/[a-zA-Z]+;base64,/.test(str);
}

// Helper: Check if the string is a valid S3 URL
function isS3Url(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  const regex = new RegExp(`^${S3_BASE_URL}/event-invites/[^/]+/[^/]+\.[a-zA-Z]+$`);
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
  userId: Joi.string().required().custom((value, helpers) => {
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

// Reusable Response Helper
const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

/**
 * POST /api/event-invites
 * Create event invite with optional base64 image
 */
router.post("/create-event-invite", async (req, res) => {
  try {
    const { error, value } = eventInviteSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const details = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", details);
    }

    const { userId, eventType, hostName, eventDate, eventTime, location, hostImage } = value;

    const eventInvite = new EventInvite({
      userId,
      eventType,
      hostName,
      eventDate: new Date(eventDate),
      eventTime,
      location,
    });

    // Handle base64 image
    if (hostImage && isBase64Image(hostImage)) {
      const { url, key } = await uploadBase64ToS3(hostImage, userId, eventInvite._id.toString());
      eventInvite.imageUrl = url;
      eventInvite.imageKey = key;
    } else if (hostImage !== null && hostImage !== undefined) {
      return sendResponse(res, 400, true, "Invalid hostImage format. Must be base64 or null");
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

/**
 * GET /api/event-invites/:id
 * Fetch event invite by ID
 */
router.get("/event-invites/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendResponse(res, 400, true, "Invalid event ID");
  }

  try {
    // Use lean() to get plain JSON and avoid Mongoose caching issues
    const invite = await EventInvite.findById(id).lean();
    if (!invite) return sendResponse(res, 404, true, "Event invite not found");
    return sendResponse(res, 200, false, "Event invite fetched", invite);
  } catch (err) {
    console.error("Fetch Invite Error:", {
      message: err.message,
      stack: err.stack,
      eventId: id,
    });
    return sendResponse(res, 500, true, "Server error");
  }
});

/**
 * PUT /api/event-invites/:id
 * Update event invite with optional base64 image (replaces old and deletes it)
 */
router.put("/event-invites/:id", async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendResponse(res, 400, true, "Invalid event ID");
  }

  try {
    // Validate request body
    const { error, value } = eventInviteSchema.validate(req.body, { abortEarly: false });
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

    const { userId, eventType, hostName, eventDate, eventTime, location, hostImage } = value;

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
        return sendResponse(res, 400, true, "Invalid hostImage format. Must be base64, null, or a valid S3 URL");
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
    return sendResponse(res, 200, false, "Invite updated successfully", updated);
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

module.exports = router;