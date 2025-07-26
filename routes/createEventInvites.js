const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const EventInvite = require("../models/event-invite");
const { uploadFileToS3 } = require("../store/multerS3Config");

// Upload function to upload a single image to aws
// const uploadFile = async (filePath, fileName, folderPath, phoneNo) => {
//   try {
//     console.log("Received request:", req.body);

//     const { folderName, customerId, vendorId, phoneNo } = req.body;
//     if (!folderName || !customerId) {
//       return res
//         .status(400)
//         .json({ message: "Folder Name and Customer ID are required." });
//     }

//     if (!req.files || req.files.length === 0) {
//       return res.status(400).json({ message: "No files were uploaded." });
//     }

//     let folderPath = vendorId
//       ? `${folderName}_${customerId}_${vendorId}`
//       : `${folderName}_${customerId}`;

//     // Process all files concurrently
//     const uploadPromises = req.files.map(async (file) => {
//       try {
//         const filePath = file.path;
//         const fileName = file.filename;
//         const thumbnailPath = `${filePath.replace(
//           /\.(png|jpeg|jpg)$/i,
//           ""
//         )}_thumbnail.webp`;

//         console.log(
//           `Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`
//         );

//         // Generate Thumbnail (Parallel)
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image (Parallel)
//         const s3UploadPromise = uploadFileToS3(
//           filePath,
//           fileName,
//           folderPath,
//           phoneNo
//         );

//         await thumbnailPromise; // Ensure thumbnail is generated before uploading

//         // Upload Thumbnail (Parallel)
//         const thumbnailFileName = `thumb_${fileName.replace(
//           /\.(png|jpeg|jpg)$/i,
//           ""
//         )}.webp`;
//         const s3ThumbPromise = uploadFileToS3(
//           thumbnailPath,
//           thumbnailFileName,
//           folderPath,
//           phoneNo
//         );

//         // Wait for both uploads to complete
//         const [s3Response, s3ThumbResponse] = await Promise.all([
//           s3UploadPromise,
//           s3ThumbPromise,
//         ]);

//         // Cleanup local files
//         fs.unlinkSync(filePath);
//         fs.unlinkSync(thumbnailPath);

//         return {
//           fileName: file.originalname,
//           fileUrl: s3Response.Location,
//           s3Key: s3Response.Key,
//           thumbnailUrl: s3ThumbResponse.Location,
//           thumbnailKey: s3ThumbResponse.Key,
//         };
//       } catch (error) {
//         console.error(`Error processing ${file.filename}:`, error);
//         return { fileName: file.originalname, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     res.status(201).json({
//       message: "Files uploaded successfully.",
//       files: uploadedFiles,
//     });
//   } catch (error) {
//     console.error("Upload error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// Joi schema for validation
const eventInviteSchema = Joi.object({
  userId: Joi.string().required(),
  eventType: Joi.string().trim().required(),
  hostName: Joi.string().trim().required(),
  eventDate: Joi.date().iso().required(), // ISO date validation
  eventTime: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
  eventTimeLines: Joi.array()
    .items(
      Joi.object({
        time: Joi.string().required(),
        activityName: Joi.string().required(),
      })
    )
    .default([]),
});

// Helper function for responses
const sendResponse = (res, status, error, message, data = null) => {
  return res.status(status).json({ error, status, message, data });
};

// POST /api/event-invites (Create Event Invite)
router.post("/create-event-invite", async (req, res) => {
  try {
    // Validate input
    const { error, value } = eventInviteSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const errors = error.details.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));
      return sendResponse(res, 422, true, "Validation failed", errors);
    }

    const {
      userId,
      eventType,
      hostName,
      eventDate,
      eventTime,
      location,
      eventTimeLines,
    } = value;

    // Validate userId as a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, true, "Invalid user ID format");
    }

    // Prepare event data
    const eventData = {
      userId,
      eventType,
      hostName,
      eventDate: new Date(eventDate),
      eventTime,
      location,
      eventTimeLines,
    };

    // Save event invite
    const newEventInvite = new EventInvite(eventData);
    const savedEventInvite = await newEventInvite.save();

    return sendResponse(
      res,
      201,
      false,
      "Event invite created successfully",
      savedEventInvite
    );
  } catch (err) {
    console.error("Error creating event invite:", err);
    return sendResponse(res, 500, true, "Internal Server Error");
  }
});

// GET /api/event-invites/:userId (Get Event Invites by User ID)
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
    return sendResponse(
      res,
      200,
      false,
      "Event invite fetched successfully",
      eventInvite
    );
  } catch (err) {
    console.error("Error fetching event invite:", err);
    return sendResponse(res, 500, true, "Internal Server Error");
  }
});

module.exports = router;
