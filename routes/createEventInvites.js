// const express = require("express");
// const router = express.Router();
// const mongoose = require("mongoose");
// const Joi = require("joi");
// const EventInvite = require("../models/event-invite");
// const { uploadFileToS3 } = require("../store/multerS3Config");

// // Upload function to upload a single image to aws
// async function processAndUploadImage(file, folderName, customerId, eventId = null, phoneNo = null) {
//   try {
//     if (!file) throw new Error("No file provided.");
//     if (!folderName || !customerId) throw new Error("folderName and customerId are required.");

//     const filePath = file.path;
//     const fileName = file.filename;
//     const originalName = file.originalname;

//     // Create folder path like `folderName_customerId_vendorId`
//     const folderPath = eventId 
//       ? `${folderName}_${customerId}_${eventId}` 
//       : `${folderName}_${customerId}`;

//     // Thumbnail path (same dir, .webp format)
//     const thumbnailPath = `${filePath.replace(/\.(png|jpeg|jpg|webp)$/i, "")}_thumbnail.webp`;

//     console.log(`Processing image: ${fileName} at ${new Date().toLocaleTimeString()}`);

//     // ✅ 1. Generate Thumbnail
//     await generateThumbnail(filePath, thumbnailPath);

//     // ✅ 2. Upload original image
//     const s3UploadPromise = uploadFileToS3(filePath, fileName, folderPath, phoneNo);

//     // ✅ 3. Upload thumbnail
//     const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg|webp)$/i, "")}.webp`;
//     const s3ThumbPromise = uploadFileToS3(thumbnailPath, thumbnailFileName, folderPath, phoneNo);

//     // Wait for both uploads to finish
//     const [s3Response, s3ThumbResponse] = await Promise.all([s3UploadPromise, s3ThumbPromise]);

//     // ✅ 4. Cleanup local temp files
//     fs.unlinkSync(filePath);
//     fs.unlinkSync(thumbnailPath);

//     return {
//       fileName: originalName,
//       fileUrl: s3Response.Location,
//       s3Key: s3Response.Key,
//       thumbnailUrl: s3ThumbResponse.Location,
//       thumbnailKey: s3ThumbResponse.Key,
//     };

//   } catch (error) {
//     console.error("Error processing image:", error);
//     throw error;
//   }
// }


// // Joi schema for validation
// const eventInviteSchema = Joi.object({
//   userId: Joi.string().required(),
//   eventType: Joi.string().trim().required(),
//   hostName: Joi.string().trim().required(),
//   eventDate: Joi.date().iso().required(), // ISO date validation
//   eventTime: Joi.string().trim().required(),
//   location: Joi.string().trim().required(),
//   eventTimeLines: Joi.array()
//     .items(
//       Joi.object({
//         time: Joi.string().required(),
//         activityName: Joi.string().required(),
//       })
//     )
//     .default([]),
// });

// // Helper function for responses
// const sendResponse = (res, status, error, message, data = null) => {
//   return res.status(status).json({ error, status, message, data });
// };

// // POST /api/event-invites (Create Event Invite)
// router.post("/create-event-invite", async (req, res) => {
//   try {
//     // Validate input
//     const { error, value } = eventInviteSchema.validate(req.body, {
//       abortEarly: false,
//     });
//     if (error) {
//       const errors = error.details.map((err) => ({
//         path: err.path.join("."),
//         message: err.message,
//       }));
//       return sendResponse(res, 422, true, "Validation failed", errors);
//     }

//     const {
//       userId,
//       eventType,
//       hostName,
//       eventDate,
//       eventTime,
//       location,
//       eventTimeLines,
//     } = value;

//     // Validate userId as a valid MongoDB ObjectId
//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return sendResponse(res, 400, true, "Invalid user ID format");
//     }

//     // Prepare event data
//     const eventData = {
//       userId,
//       eventType,
//       hostName,
//       eventDate: new Date(eventDate),
//       eventTime,
//       location,
//       eventTimeLines,
//     };

//     // Save event invite
//     const newEventInvite = new EventInvite(eventData);
//     const savedEventInvite = await newEventInvite.save();

//     let imageConfig = {
//         file: req.file,
//         folderName: "event-invites",
//         customerId: userId,
//         eventId: savedEventInvite._id.toString(),
//         phoneNo: req.body.phoneNo || null,
//     }

//     const imageData = processAndUploadImage()

//     return sendResponse(
//       res,
//       201,
//       false,
//       "Event invite created successfully",
//       savedEventInvite
//     );
//   } catch (err) {
//     console.error("Error creating event invite:", err);
//     return sendResponse(res, 500, true, "Internal Server Error");
//   }
// });

// // GET /api/event-invites/:userId (Get Event Invites by User ID)
// router.get("/event-invites/:id", async (req, res) => {
//   const { id } = req.params;

//   if (!mongoose.Types.ObjectId.isValid(id)) {
//     return sendResponse(res, 400, true, "Invalid event ID format");
//   }

//   try {
//     const eventInvite = await EventInvite.findById(id);
//     if (!eventInvite) {
//       return sendResponse(res, 404, true, "Event invite not found");
//     }
//     return sendResponse(
//       res,
//       200,
//       false,
//       "Event invite fetched successfully",
//       eventInvite
//     );
//   } catch (err) {
//     console.error("Error fetching event invite:", err);
//     return sendResponse(res, 500, true, "Internal Server Error");
//   }
// });

// module.exports = router;




// const express = require("express");
// const router = express.Router();
// const mongoose = require("mongoose");
// const Joi = require("joi");
// const EventInvite = require("../models/event-invite");
// const multer = require("multer");
// const upload = multer({ dest: "uploads/" }); // temp storage
// const fs = require("fs");
// const path = require("path");

// // ✅ S3 Upload function
// const AWS = require("aws-sdk");
// const s3 = new AWS.S3({
//   accessKeyId: process.env.AWS_ACCESS_KEY,
//   secretAccessKey: process.env.AWS_SECRET_KEY,
//   region: process.env.AWS_REGION,
// });
// const S3_BUCKET = process.env.AWS_BUCKET_NAME; 
// const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;

// /**
//  * Upload a single file to S3
//  * @param {string} filePath - local temp file path
//  * @param {string} s3Key - key to save in S3 (folder/filename.ext)
//  * @returns uploaded file URL
//  */
// // async function uploadFileToS3(filePath, s3Key) {
// //   const fileContent = fs.readFileSync(filePath);
// //   const contentType = getContentTypeByExt(s3Key);

// //   const params = {
// //     Bucket: S3_BUCKET,
// //     Key: s3Key,
// //     Body: fileContent,
// //     ContentType: contentType,
// //   };

// //   await s3.upload(params).promise();

// //   // Cleanup local file after upload
// //   fs.unlinkSync(filePath);

// //   return `${S3_BASE_URL}/${s3Key}`;
// // }


// function uploadBase64ToS3(base64String, userId, eventId) {
//   const matches = base64String.match(/^data:(.+);base64,(.+)$/);
//   const mimeType = matches[1]; // e.g., image/png
//   const base64Data = Buffer.from(matches[2], "base64");

//   const ext = mimeType.split("/")[1];
//   const s3Key = `event-invites/${userId}/${eventId}.${ext}`;

//   return s3.upload({
//     Bucket: S3_BUCKET,
//     Key: s3Key,
//     Body: base64Data,
//     ContentEncoding: "base64",
//     ContentType: mimeType
//   }).promise().then(() => `${S3_BASE_URL}/${s3Key}`);
// }

// // ✅ Helper to get MIME type by extension
// function getContentTypeByExt(fileName) {
//   const ext = path.extname(fileName).toLowerCase();
//   switch (ext) {
//     case ".jpg":
//     case ".jpeg":
//       return "image/jpeg";
//     case ".png":
//       return "image/png";
//     case ".webp":
//       return "image/webp";
//     default:
//       return "application/octet-stream";
//   }
// }

// // ✅ Joi schema
// const eventInviteSchema = Joi.object({
//   userId: Joi.string().required(),
//   eventType: Joi.string().trim().required(),
//   hostName: Joi.string().trim().required(),
//   eventDate: Joi.date().iso().required(),
//   eventTime: Joi.string().trim().required(),
//   location: Joi.string().trim().required(),
//   eventTimeLines: Joi.array().items(
//     Joi.object({
//       time: Joi.string().required(),
//       activityName: Joi.string().required(),
//     })
//   ).default([]),
// });

// // ✅ Response helper
// const sendResponse = (res, status, error, message, data = null) =>
//   res.status(status).json({ error, status, message, data });

// /**
//  * ✅ POST /api/event-invites (Create Event Invite + Upload Image)
//  */
// router.post("/create-event-invite", upload.single("image"), async (req, res) => {
//   try {
//     // ✅ Validate request body
//     const { error, value } = eventInviteSchema.validate(req.body, { abortEarly: false });
//     if (error) {
//       const errors = error.details.map(err => ({
//         path: err.path.join("."),
//         message: err.message,
//       }));
//       return sendResponse(res, 422, true, "Validation failed", errors);
//     }

//     const { userId, eventType, hostName, eventDate, eventTime, location, eventTimeLines } = value;

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return sendResponse(res, 400, true, "Invalid user ID format");
//     }

//     // ✅ Step 1: Create Event without image first
//     const newEventInvite = new EventInvite({
//       userId,
//       eventType,
//       hostName,
//       eventDate: new Date(eventDate),
//       eventTime,
//       location,
//       eventTimeLines,
//     });

//     const savedEventInvite = await newEventInvite.save();

//     // ✅ Step 2: If image provided, upload to S3
//     let imageUrl = null;
//     if (req.file) {
//       const ext = path.extname(req.file.originalname).toLowerCase(); // .jpg, .png
//       const s3Key = `event-invites/${userId}/${savedEventInvite._id}${ext}`;

//       imageUrl = await uploadBase64ToS3(req.file.path, s3Key);

//       // ✅ Save URL to DB
//       savedEventInvite.imageUrl = imageUrl;
//       await savedEventInvite.save();
//     }

//     return sendResponse(res, 201, false, "Event invite created successfully", {
//       ...savedEventInvite.toObject(),
//       imageUrl,
//     });

//   } catch (err) {
//     console.error("Error creating event invite:", err);
//     return sendResponse(res, 500, true, "Internal Server Error");
//   }
// });

// /**
//  * ✅ GET /api/event-invites/:id (Fetch Single Event Invite)
//  */
// router.get("/event-invites/:id", async (req, res) => {
//   const { id } = req.params;

//   if (!mongoose.Types.ObjectId.isValid(id)) {
//     return sendResponse(res, 400, true, "Invalid event ID format");
//   }

//   try {
//     const eventInvite = await EventInvite.findById(id);
//     if (!eventInvite) {
//       return sendResponse(res, 404, true, "Event invite not found");
//     }

//     return sendResponse(res, 200, false, "Event invite fetched successfully", eventInvite);

//   } catch (err) {
//     console.error("Error fetching event invite:", err);
//     return sendResponse(res, 500, true, "Internal Server Error");
//   }
// });

// module.exports = router;







const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const EventInvite = require("../models/event-invite");
const AWS = require("aws-sdk");

// ✅ AWS S3 Config
const s3 = new AWS.S3({
  accessKeyId:process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;

// ✅ Function to upload base64 image to S3
async function uploadBase64ToS3(base64String, userId, eventId) {
  if (!base64String) return null;

  const matches = base64String.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 string");

  const mimeType = matches[1]; // e.g., image/png
  const base64Data = Buffer.from(matches[2], "base64");
  const ext = mimeType.split("/")[1]; // png/jpg/jpeg
  const s3Key = `event-invites/${userId}/${eventId}.${ext}`;

  const params = {
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: base64Data,
    ContentEncoding: "base64",
    ContentType: mimeType,
  };

  await s3.upload(params).promise();
  return `${S3_BASE_URL}/${s3Key}`;
}

// ✅ Joi Schema for validation
const eventInviteSchema = Joi.object({
  userId: Joi.string().required(),
  eventType: Joi.string().trim().required(),
  hostName: Joi.string().trim().required(),
  eventDate: Joi.date().iso().required(),
  eventTime: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
  eventTimeLines: Joi.array().items(
    Joi.object({
      time: Joi.string().required(),
      activityName: Joi.string().required(),
    })
  ).default([]),
  hostImage: Joi.string().optional(),
});

// ✅ Response helper
const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

/**
 * ✅ POST /api/event-invites (Base64 support)
 */
router.post("/create-event-invite", async (req, res) => {
  try {
    // ✅ Validate input body
    const { error, value } = eventInviteSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(err => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", errors);
    }

    const { userId, eventType, hostName, eventDate, eventTime, location, eventTimeLines, hostImage } = value;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID format");
    }

    // ✅ Step 1: Save event without image first
    const newEventInvite = new EventInvite({
      userId,
      eventType,
      hostName,
      eventDate: new Date(eventDate),
      eventTime,
      location,
      eventTimeLines,
    });

    const savedEventInvite = await newEventInvite.save();

    // ✅ Step 2: If base64 hostImage is provided, upload to S3
    let imageUrl = null;
    if (hostImage) {
      imageUrl = await uploadBase64ToS3(hostImage, userId, savedEventInvite._id.toString());

      // Save URL in DB
      savedEventInvite.imageUrl = imageUrl;
      await savedEventInvite.save();
    }

    return sendResponse(res, 201, false, "Event invite created successfully", {
      ...savedEventInvite.toObject(),
      imageUrl,
    });

  } catch (err) {
    console.error("Error creating event invite:", err);
    return sendResponse(res, 500, true, "Internal Server Error");
  }
});

/**
 * ✅ GET /api/event-invites/:id (Fetch Single Event Invite)
 */
router.get("/event-invites/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendResponse(res, 400, true, "Invalid event ID format");
  }

  try {
    const eventInvite = await EventInvite.findById(id);
    if (!eventInvite) {
      return sendResponse(res, 404, true, "Event invite not found");
    }

    return sendResponse(res, 200, false, "Event invite fetched successfully", eventInvite);

  } catch (err) {
    console.error("Error fetching event invite:", err);
    return sendResponse(res, 500, true, "Internal Server Error");
  }
});

module.exports = router;
