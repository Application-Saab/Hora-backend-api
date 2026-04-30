const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Venues = require("../models/party-venue");
const User = require("../models/user"); // ✅ added
const VenueVisitors = require("../models/venue-visitors"); // ✅ added
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const VenueImages = require("../models/venueImages");
const {
  generateThumbnail,
} = require("../store/multerS3Config");

const sendResponse = (res, status, error, message, data = null) =>
res.status(status).json({ error, status, message, data });



// =============================================
// CREATE VENUE
// Creates a new party venue for a user
// Validates userId and ensures user exists
// =============================================
router.post("/create-party-venue", async (req, res) => {
  try {
    const {
      userId,
      venueType,
      venueName,
      location,
      googleMapLink
    } = req.body;

    console.log("API HIT");

    // ✅ Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid userId",
        error: true
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Owner not found",
        error: true
      });
    }

    const venue = await Venues.create({
      userId,
      venueType,
      venueName,
      location,
      googleMapLink
    });

    return res.status(201).json({
      message: "Venue created successfully",
      error: false,
      data: venue
    });

  } catch (err) {
    console.error("Create Venue Error:", err);
    return res.status(500).json({
      message: "Server error",
      error: true
    });
  }
});


// =============================================
// GET VENUE DETAILS
// Fetches a single venue by ID
// Returns basic venue info
// =============================================
router.get("/venue-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid venue ID",
        error: true
      });
    }

    // ✅ Fetch venue
    const venue = await Venues.findById(id)
      .select(
        "userId venueType venueName location googleMapLink createdAt"
      )
      .lean();

    if (!venue) {
      return res.status(404).json({
        message: "Venue not found",
        error: true
      });
    }

    return res.status(200).json({
      message: "Venue fetched successfully",
      error: false,
      data: venue
    });

  } catch (err) {
    console.error("Fetch Venue Error:", {
      message: err.message,
      stack: err.stack,
      venueId: req.params.id
    });

    return res.status(500).json({
      message: "Server error",
      error: true
    });
  }
});


// =============================================
// UPDATE VENUE DETAILS
// Updates venue fields (partial update allowed)
// Only updates fields provided in request body
// =============================================
router.put("/venue-details/:id", async (req, res) => {
  const { id } = req.params;

  // ✅ Validate venue ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid venue ID",
      error: true
    });
  }

  try {
    // ✅ Find existing venue
    const existing = await Venues.findById(id);

    if (!existing) {
      return res.status(404).json({
        message: "Venue not found",
        error: true
      });
    }

    const {
      venueName,
      venueType,
      location,
      googleMapLink
    } = req.body;

    // ✅ Update only provided fields (partial update)
    if (venueName !== undefined) existing.venueName = venueName;
    if (venueType !== undefined) existing.venueType = venueType;
    if (location !== undefined) existing.location = location;
    if (googleMapLink !== undefined) existing.googleMapLink = googleMapLink;

    // ✅ Save updated document
    const updated = await existing.save();

    return res.status(200).json({
      message: "Venue updated successfully",
      error: false,
      data: updated
    });

  } catch (err) {
    console.error("Update Venue Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
      venueId: id
    });

    return res.status(500).json({
      message: "Server error",
      error: true
    });
  }
});


// =============================================
// REGISTER VENUE VISITOR
// Logs that a user visited a venue
// Prevents duplicate entries (same user + venue)
// =============================================
router.post("/venue-visitor", async (req, res) => {
  try {
    const { userId, venueId } = req.body;

    // ✅ Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(venueId)
    ) {
      return res.status(400).json({
        message: "Invalid userId or venueId",
        error: true
      });
    }

    // ✅ Check duplicate
    const existingVisitor = await VenueVisitors.findOne({
      userId,
      venueId
    }).lean();

    if (existingVisitor) {
      return res.status(409).json({
        message: "User already visited this venue",
        error: true
      });
    }

    // ✅ Create new visitor
    const visitor = new VenueVisitors({
      userId,
      venueId
    });

    const savedVisitor = await visitor.save();

    return res.status(201).json({
      message: "Venue visitor registered",
      error: false,
      data: savedVisitor
    });

  } catch (err) {
    console.error("Create Venue Visitor Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body
    });

    return res.status(500).json({
      message: "Server error",
      error: true
    });
  }
});  


// =============================================
// GET ALL VISITORS OF A VENUE
// Returns list of users who visited a venue
// Includes user details via aggregation
// =============================================
router.get("/venue-visitors/all/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;

    // Validate venueId
    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return sendResponse(res, 400, true, "Invalid venue ID");
    }

    const visitors = await VenueVisitors.aggregate([
      {
        $match: {
          venueId: new mongoose.Types.ObjectId(venueId),
        },
      },

      // Join user details
      {
        $lookup: {
          from: "users", // make sure this matches your actual collection name
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // Format response
      {
        $project: {
          _id: 0,
          userId: "$user._id",
          name: "$user.name",
          phone: "$user.phone",
          avatar: "$user.avatar",
          visitedAt: "$createdAt",
        },
      },

      // Latest visitors first
      { $sort: { visitedAt: -1 } },
    ]);

    return sendResponse(
      res,
      200,
      false,
      "Venue visitors fetched successfully",
      visitors || []
    );
  } catch (err) {
    console.error("Fetch Venue Visitors Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});


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

// =============================================
// UPLOAD IMAGE TO S3 HELPER
// Uploads file to AWS S3
// Supports folder-based structure in S3
// =============================================
const uploadImageToS3 = async (
  filePath,
  fileName,
  userId,
  venueId,
  mimeType,
  folderId = null, // ✅ NEW
  folderName = "venue-images"
) => {
  const params = {
    Bucket: S3_BUCKET,

    // ✅ UPDATED PATH (supports folders)
    Key: `${folderName}/${userId}/${venueId}/${folderId || "general"}/${fileName}`,

    Body: fs.createReadStream(filePath),
    ContentType: mimeType,
  };

  return await s3.upload(params).promise();
};

// =============================================
// UPLOAD VENUE IMAGE (WITH THUMBNAIL)
// 1. Accepts image via multer
// 2. Generates compressed thumbnail
// 3. Uploads original + thumbnail to S3
// 4. Stores metadata in DB
// 5. Supports assigning image to a folder
// =============================================
router.post(
  "/venue-images/upload-processed/:venueId",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) return sendResponse(res, 400, true, err.message);
      next();
    });
  },
  async (req, res) => {
    try {
      const { venueId } = req.params;
      const { userId, folderId = null } = req.body;

      if (!mongoose.Types.ObjectId.isValid(venueId)) {
        return sendResponse(res, 400, true, "Invalid venueId");
      }

      const file = req.file;
      if (!file) {
        return sendResponse(res, 400, true, "Image file required");
      }

      const filePath = file.path;
      const fileName = file.filename;

      const thumbName = `thumb_${fileName}.webp`;
      const thumbPath = path.join(path.dirname(filePath), thumbName);

      let uploadResult, thumbUpload;

      try {
        // 🔥 Generate thumbnail (same as event)
        await generateThumbnail(filePath, thumbPath);

        // Upload original
        uploadResult = await uploadImageToS3(
          filePath,
          fileName,
          userId,
          venueId,
          file.mimetype,
          folderId // ✅ NEW
        );

        // Upload thumbnail
        thumbUpload = await uploadImageToS3(
          thumbPath,
          thumbName,
          userId,
          venueId,
          "image/webp",
           folderId // ✅ NEW
        );

      } finally {
        // Cleanup local files
        for (const p of [filePath, thumbPath]) {
          if (!p) continue;
          try {
            await fs.promises.unlink(p);
          } catch {}
        }
      }

      // Save to DB
      const imageData = {
        name: file.originalname,
        imageUrl: uploadResult.Location,
        imageKey: uploadResult.Key,
        thumbnailUrl: thumbUpload.Location,
        thumbnailKey: thumbUpload.Key,
       folderIds: folderId ? [folderId] : [],
        uploadedBy: userId,
      };

      const updated = await VenueImages.findOneAndUpdate(
        { venueId },
        { $push: { images: imageData } },
        { new: true, upsert: true }
      );

      return sendResponse(res, 201, false, "Image uploaded successfully", imageData);

    } catch (err) {
      console.error("Processed Upload Error:", err);
      return sendResponse(res, 500, true, "Server error");
    }
  }
);


// =============================================
// GET ALL IMAGES OF A VENUE
// Returns all images (no folder filtering)
// Used for "All" tab
// =============================================
router.get("/venue-images/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;

    const data = await VenueImages.findOne({ venueId }).lean();

    return res.status(200).json({
      message: "All images fetched",
      images: data?.images || [],
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// =============================================
// CREATE SUB-FOLDER INSIDE VENUE
// Adds a new folder (category) to venue
// - Max 50 folders allowed
// - Prevents duplicate names
// =============================================
router.post("/venue-folder/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    const { folderName, category, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({ message: "Invalid venueId" });
    }

    const venue = await Venues.findById(venueId);

    if (!venue) {
      return res.status(404).json({ message: "Venue not found" });
    }
     // ✅ VALIDATE NAME
    if (!folderName || !folderName.trim()) {
      return res.status(400).json({
        message: "Folder name is required",
      });
    }

    // ✅ FINAL NAME
    const finalName = (folderName || "Untitled Folder").trim();

    // ✅ CREATE
    venue.subFolders.push({
      folderName: finalName,
      category: category || "custom",
      createdBy: userId,
    });

    await venue.save();

    res.status(201).json({
      message: "Folder created",
      folders: venue.subFolders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// =============================================
// GET IMAGES BY FOLDER
// Filters images that belong to a specific folder
// Works with multi-folder support (folderIds array)
// Returns latest images first
// =============================================
// fetch images of a folder
router.get("/venue-images/:venueId/folder/:folderId", async (req, res) => {
  try {
    const { venueId, folderId } = req.params;

    // ✅ Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(venueId) ||
      !mongoose.Types.ObjectId.isValid(folderId)
    ) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    // ✅ Fetch data
    const data = await VenueImages.findOne({ venueId }).lean();

    if (!data) {
      return res.status(200).json({
        message: "No images found",
        images: [],
      });
    }

    // ✅ Filter by folderId
    const filtered =
      data.images.filter(
    (img) =>
  img.folderIds?.some(
    (id) => id.toString() === folderId
  )
      ) || [];

    // ✅ 👉 SORT (latest first)
    const sorted = filtered.sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // ✅ Response
    return res.status(200).json({
      message: "Folder images fetched successfully",
      images: sorted,
    });

  } catch (err) {
    console.error("Fetch folder images error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});



// Rename FOlder
router.put("/venue-folder/rename/:venueId/:folderId", async (req, res) => {
  try {
    const { venueId, folderId } = req.params;
    const { folderName } = req.body;

    const venue = await Venues.findById(venueId);

    const folder = venue.subFolders.id(folderId);

    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    folder.folderName = folderName.trim();

    await venue.save();

    res.json({ message: "Folder renamed", folders: venue.subFolders });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// get folder with image count
router.get("/venue-folders/:venueId", async (req, res) => {
  const { venueId } = req.params;

  const venue = await Venues.findById(venueId).lean();
  const data = await VenueImages.findOne({ venueId }).lean();

  const images = data?.images || [];

  const folders = venue.subFolders.map((folder) => {
    const count = images.filter((img) =>
      img.folderIds?.some((id) => id.toString() === folder._id.toString())
    ).length;

    return {
      ...folder,
      imageCount: count,
    };
  });

  res.json(folders);
});


// =============================================
// ASSIGN / REMOVE IMAGES TO/FROM FOLDER
// - addImageIds → adds folder to images
// - removeImageIds → removes folder from images
// Uses MongoDB arrayFilters for nested updates
// Supports multi-folder tagging
// =============================================
router.put("/assign-to-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({ message: "subFolderId is required" });
    }

    // ✅ ADD images to folder
    if (addImageIds.length > 0) {
      await VenueImages.updateMany(
        { "images._id": { $in: addImageIds } },
        {
          $addToSet: {
            "images.$[elem].folderIds": subFolderId,
          },
        },
        {
          arrayFilters: [{ "elem._id": { $in: addImageIds } }],
        }
      );
    }

    // ✅ REMOVE images from folder
    if (removeImageIds.length > 0) {
      await VenueImages.updateMany(
        { "images._id": { $in: removeImageIds } },
        {
          $pull: {
            "images.$[elem].folderIds": subFolderId,
          },
        },
        {
          arrayFilters: [{ "elem._id": { $in: removeImageIds } }],
        }
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


module.exports = router;