const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Venues = require("../models/party-venue");
const User = require("../models/user");
const VenueVisitors = require("../models/venue-visitors");
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const VenueImages = require("../models/venueImages");
const {
  generateThumbnail,
  generateTemplateThumbnail,
} = require("../store/multerS3Config");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

// =============================================
// GET ALL VENUES (Party Hall List)
// Supports pagination + search For Admin
// =============================================
router.get("/venues-list", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", venueType = "" } = req.query;

    const query = {};

    // 🔍 Search by name or location
    if (search) {
      query.$or = [
        { venueName: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    // 🎯 Filter by type
    if (venueType) {
      query.venueType = venueType;
    }

    const skip = (page - 1) * limit;

    const venues = await Venues.find(query)
      // .select(
      //   "venueName venueType location googleMapLink createdAt venueImageUrl subFolders termsAndConditionsHtml",
      // )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Venues.countDocuments(query);

    return res.status(200).json({
      message: "Party halls fetched successfully",
      data: venues,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Fetch venues error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Public Venue Listing API with filters
router.get("/venues-public-list", async (req, res) => {
  try {
    const { city, eventType, venueType, guestCapacity } = req.query;

    const query = {
      venueStatus: 1,
    };

    // ----------------------------
    // CITY FILTER (partial match)
    // ----------------------------
    if (city) {
      query.city = { $regex: city, $options: "i" };
    }

    // ----------------------------
    // VENUE TYPE FILTER
    // ----------------------------
    if (venueType) {
      const venueTypesArray = venueType.split(",");

      query.venueType = {
        $in: venueTypesArray,
      };
    }

    // ----------------------------
    // EVENT TYPE FILTER (array contains)
    // ----------------------------
    if (eventType) {
      const eventTypesArray = eventType.split(",");

      query.eventTypes = {
        $in: eventTypesArray,
      };
    }

    // ----------------------------
    // GUEST CAPACITY FILTER
    // (get venues >= required capacity)
    // ----------------------------
    if (guestCapacity) {
      query.guestCapacity = { $gte: Number(guestCapacity) };
    }

    // ----------------------------
    // QUERY EXECUTION (FAST)
    // ----------------------------
    const venues = await Venues.find(query)
      // .select(
      //   "venueName venueType city location googleMapLink venueImageUrl guestCapacity eventTypes foodTypes hallType startingPrice"
      // )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Public venues fetched successfully",
      data: venues,
    });
  } catch (err) {
    console.error("Public venues fetch error:", err);
    return res.status(500).json({
      message: "Server error",
      error: true,
    });
  }
});

// =============================================
// CREATE VENUE
// Creates a new party venue for a user
// Validates userId and ensures user exists
// =============================================
router.post(
  "/create-party-venue",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        return sendResponse(res, 400, true, err.message);
      }
      next();
    });
  },

  async (req, res) => {
    try {
      let {
        userId,
        venueType,
        venueName,
        location,
        city,
        googleMapLink,
        eventTypes,
        guestCapacity,
        locality,
        isParkingAvailable,
        hallType,
        foodTypes,
        startingPrice,
        totalRoomsAvailable,
      } = req.body;

      // ----------------------------
      // Validate userId
      // ----------------------------
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid userId");
      }

      const user = await User.findById(userId);

      if (!user) {
        return sendResponse(res, 404, true, "Owner not found");
      }

      // ----------------------------
      // Parse JSON fields (IMPORTANT)
      // because frontend is sending stringify
      // ----------------------------
      eventTypes = eventTypes ? JSON.parse(eventTypes) : [];
      venueType = typeof venueType === 'string' ? JSON.parse(venueType) : venueType;
      hallType = hallType ? JSON.parse(hallType) : [];
      foodTypes = foodTypes ? JSON.parse(foodTypes) : [];

      guestCapacity = guestCapacity ? Number(guestCapacity) : 0;
      startingPrice = startingPrice ? Number(startingPrice) : 0;
      totalRoomsAvailable = totalRoomsAvailable
        ? Number(totalRoomsAvailable)
        : 0;

      isParkingAvailable =
        isParkingAvailable === "true" || isParkingAvailable === true;

      // ----------------------------
      // Create venue
      // ----------------------------
      const venue = await Venues.create({
        userId,
        venueType,
        venueName,
        location,
        city,
        locality,
        googleMapLink,
        eventTypes,
        guestCapacity,
        isParkingAvailable,
        hallType,
        foodTypes,
        startingPrice,
      });

      // ----------------------------
      // Image upload
      // ----------------------------
      let venueImageUrl = "";
      let venueImageKey = "";

      if (req.file) {
        const webpFileName = `venue-${Date.now()}.webp`;

        const webpPath =
          req.file.path.replace(/\.(png|jpeg|jpg)$/i, "") + ".webp";

        await generateTemplateThumbnail(req.file.path, webpPath);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          userId,
          venue._id,
          "image/webp",
          "venues",
        );

        venueImageUrl = uploadResult.Location;
        venueImageKey = uploadResult.Key;

        venue.venueImageUrl = venueImageUrl;
        venue.venueImageKey = venueImageKey;

        await venue.save();

        await Promise.all([
          deleteFileWithRetry(req.file.path),
          deleteFileWithRetry(webpPath),
        ]);
      }

      return sendResponse(res, 201, false, "Venue created successfully", venue);
    } catch (err) {
      console.log(err);
      return sendResponse(res, 500, true, "Server error");
    }
  },
);

// Update venue Status
router.patch("/venue-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { venueStatus } = req.body;

    // -------------------------
    // Validate ID
    // -------------------------
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid venue ID",
        error: true,
      });
    }

    // -------------------------
    // Allow ONLY active/inactive
    // -------------------------
    if (![1, 2].includes(venueStatus)) {
      return res.status(400).json({
        message: "Invalid status. Use 1 (active) or 2 (inactive)",
        error: true,
      });
    }

    // -------------------------
    // Find venue
    // -------------------------
    const venue = await Venues.findById(id);

    if (!venue) {
      return res.status(404).json({
        message: "Venue not found",
        error: true,
      });
    }

    // -------------------------
    // Update status
    // -------------------------
    venue.venueStatus = venueStatus;

    await venue.save();

    return res.status(200).json({
      message: "Venue status updated successfully",
      error: false,
      data: venue,
    });
  } catch (err) {
    console.error("Venue status update error:", err);

    return res.status(500).json({
      message: "Server error",
      error: true,
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
        error: true,
      });
    }

    // ✅ Fetch venue
    const venue = await Venues.findById(id)
      .select(
        "userId venueType venueName location googleMapLink venueImageUrl subFolders createdAt termsAndConditionsHtml",
      )
      .lean();

    if (!venue) {
      return res.status(404).json({
        message: "Venue not found",
        error: true,
      });
    }

    return res.status(200).json({
      message: "Venue fetched successfully",
      error: false,
      data: venue,
    });
  } catch (err) {
    console.error("Fetch Venue Error:", {
      message: err.message,
      stack: err.stack,
      venueId: req.params.id,
    });

    return res.status(500).json({
      message: "Server error",
      error: true,
    });
  }
});

router.put("/update-terms/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { termsAndConditionsHtml } = req.body;

    const venue = await Venues.findById(id);

    if (!venue) {
      return res.status(404).json({
        error: true,
        message: "Venue not found",
      });
    }

    venue.termsAndConditionsHtml = termsAndConditionsHtml;

    await venue.save();

    return res.status(200).json({
      error: false,
      message: "Terms updated successfully",
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// Update Venue Banner Image
router.put(
  "/venue-banner-image/:venueId",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        return sendResponse(res, 400, true, err.message);
      }

      next();
    });
  },
  async (req, res) => {
    try {
      const { venueId } = req.params;

      const { userId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(venueId)) {
        return sendResponse(res, 400, true, "Invalid venueId");
      }

      const venue = await Venues.findById(venueId);

      if (!venue) {
        return sendResponse(res, 404, true, "Venue not found");
      }

      if (!req.file && req.body.clearImage !== "true") {
        return sendResponse(res, 400, true, "Image required");
      }

      if (req.file) {
        if (venue.venueImageKey) {
          await deleteFromS3(venue.venueImageKey);
        }

        const webpFileName = `venue-${Date.now()}.webp`;

        const webpPath =
          req.file.path.replace(/\.(png|jpeg|jpg)$/i, "") + ".webp";

        await generateTemplateThumbnail(req.file.path, webpPath);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          userId,
          venueId,
          "image/webp",
          "venues",
        );

        venue.venueImageUrl = uploadResult.Location;

        venue.venueImageKey = uploadResult.Key;

        await venue.save();

        await Promise.all([
          deleteFileWithRetry(req.file.path),
          deleteFileWithRetry(webpPath),
        ]);
      }

      if (req.body.clearImage === "true") {
        if (venue.venueImageKey) {
          await deleteFromS3(venue.venueImageKey);

          venue.venueImageUrl = "";
          venue.venueImageKey = "";

          await venue.save();
        }
      }

      return sendResponse(
        res,
        200,
        false,
        "Venue image updated successfully",
        venue,
      );
    } catch (err) {
      console.log(err);

      return sendResponse(res, 500, true, "Server error");
    }
  },
);

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
        error: true,
      });
    }

    // ✅ Check duplicate
    const existingVisitor = await VenueVisitors.findOne({
      userId,
      venueId,
    }).lean();

    if (existingVisitor) {
      return res.status(409).json({
        message: "User already visited this venue",
        error: true,
      });
    }

    // ✅ Create new visitor
    const visitor = new VenueVisitors({
      userId,
      venueId,
    });

    const savedVisitor = await visitor.save();

    return res.status(201).json({
      message: "Venue visitor registered",
      error: false,
      data: savedVisitor,
    });
  } catch (err) {
    console.error("Create Venue Visitor Error:", {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });

    return res.status(500).json({
      message: "Server error",
      error: true,
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
      visitors || [],
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
  folderName = "venue-images",
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

// Helper: Delete image from S3
async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

// Update venue details
router.put(
  "/venue-details/:id",
  (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        return sendResponse(res, 400, true, err.message);
      }
      next();
    });
  },

  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid venue ID",
        error: true,
      });
    }

    try {
      const existing = await Venues.findById(id);

      if (!existing) {
        return res.status(404).json({
          message: "Venue not found",
          error: true,
        });
      }

      let {
        venueName,
        venueType,
        location,
        city,
        googleMapLink,
        eventTypes,
        guestCapacity,
        locality,
        isParkingAvailable,
        hallType,
        foodTypes,
        startingPrice,
        totalRoomsAvailable,
      } = req.body;

      // ----------------------------
      // Basic fields
      // ----------------------------
      if (venueName !== undefined) existing.venueName = venueName;
      // if (venueType !== undefined) existing.venueType = venueType;
      if (location !== undefined) existing.location = location;
      if (city !== undefined) existing.city = city;
      if (googleMapLink !== undefined) existing.googleMapLink = googleMapLink;
      if (locality !== undefined) existing.locality = locality;

      // ----------------------------
      // Parse JSON fields
      // ----------------------------
      if (eventTypes !== undefined)
        existing.eventTypes = eventTypes ? JSON.parse(eventTypes) : [];

      if (venueType !== undefined)
        existing.venueType = typeof venueType === 'string' ? JSON.parse(venueType) : venueType;

      if (hallType !== undefined)
        existing.hallType = hallType ? JSON.parse(hallType) : [];

      if (foodTypes !== undefined)
        existing.foodTypes = foodTypes ? JSON.parse(foodTypes) : [];

      // ----------------------------
      // Numbers
      // ----------------------------
      if (guestCapacity !== undefined)
        existing.guestCapacity = Number(guestCapacity || 0);

      if (startingPrice !== undefined)
        existing.startingPrice = Number(startingPrice || 0);

      if (totalRoomsAvailable !== undefined)
        existing.totalRoomsAvailable = Number(totalRoomsAvailable || 0);

      // ----------------------------
      // Boolean
      // ----------------------------
      if (isParkingAvailable !== undefined) {
        existing.isParkingAvailable =
          isParkingAvailable === "true" || isParkingAvailable === true;
      }

      // ----------------------------
      // IMAGE UPDATE
      // ----------------------------
      if (req.file) {
        if (existing.venueImageKey) {
          await deleteFromS3(existing.venueImageKey);
        }

        const webpFileName = `venue-${Date.now()}.webp`;

        const webpPath =
          req.file.path.replace(/\.(png|jpg|jpeg)$/i, "") + ".webp";

        await generateTemplateThumbnail(req.file.path, webpPath);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          existing.userId.toString(),
          id,
          "image/webp",
          "venues",
        );

        existing.venueImageUrl = uploadResult.Location;
        existing.venueImageKey = uploadResult.Key;

        await deleteFileWithRetry(req.file.path);
        await deleteFileWithRetry(webpPath);
      }

      const updated = await existing.save();

      return res.status(200).json({
        message: "Venue updated successfully",
        error: false,
        data: updated,
      });
    } catch (err) {
      console.error("Update Venue Error:", err);

      return res.status(500).json({
        message: "Server error",
        error: true,
      });
    }
  },
);
// =============================================
// GET ALL IMAGES OF A VENUE
// Returns all images (no folder filtering)
// Used for "All" tab
// =============================================
router.get("/venue-images/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;

    const data = await VenueImages.find({ venueId }).lean();

    return res.status(200).json({
      message: "All images fetched",
      data: data || [],
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// =============================================
// DELETE VENUE IMAGE / VIDEO
// Deletes original + webp/preview from S3
// =============================================
router.post("/venue-image/:imageId", async (req, res) => {
  try {
    const { imageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(imageId)) {
      return res.status(400).json({
        message: "Invalid image id",
      });
    }

    const image = await VenueImages.findById(imageId);

    if (!image) {
      return res.status(404).json({
        message: "Media not found",
      });
    }

    // Delete original file
    if (image.postKey) {
      try {
        await deleteFromS3(image.postKey);
      } catch (err) {
        console.error("Original file delete error:", err);
      }
    }

    // Delete webp / video preview
    if (image.postWebpKey) {
      try {
        await deleteFromS3(image.postWebpKey);
      } catch (err) {
        console.error("Preview delete error:", err);
      }
    }

    await VenueImages.findByIdAndDelete(imageId);

    return res.status(200).json({
      message: "Media deleted successfully",
      error: false,
    });
  } catch (err) {
    console.error("Delete venue media error:", err);

    return res.status(500).json({
      message: "Server error",
      error: true,
    });
  }
});

// =============================================
// CREATE SUB-FOLDER INSIDE VENUE
// Adds a new folder (category) to venue
// - Max 50 folders allowed
// - Prevents duplicate names
// =============================================

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
router.post(
  "/venue/create-subfolder/:venueId",
  upload.single("image"),
  async (req, res) => {
    try {
      const { venueId } = req.params;
      const { folderName, userId } = req.body;

      // ================= VALIDATION =================
      if (!mongoose.Types.ObjectId.isValid(venueId)) {
        return sendResponse(res, 400, true, "Invalid venueId");
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return sendResponse(res, 400, true, "Invalid userId");
      }

      if (!folderName) {
        return sendResponse(res, 400, true, "folderName required");
      }

      // ================= FIND VENUE =================
      const venue = await Venues.findById(venueId);

      if (!venue) {
        return sendResponse(res, 404, true, "Venue not found");
      }

      // ================= DUPLICATE CHECK =================
      const alreadyExists = venue.subFolders.some(
        (sf) => sf.folderName.toLowerCase() === folderName.toLowerCase(),
      );

      if (alreadyExists) {
        return sendResponse(res, 409, true, "Folder already exists");
      }

      // ================= HANDLE IMAGE (optional DP) =================
      let folderDp = {};

      if (req.file) {
        const file = req.file;

        const filePath = file.path;
        const fileName = file.filename;

        const thumbName = `thumb_${fileName}.webp`;
        const thumbPath = path.join(path.dirname(filePath), thumbName);

        try {
          await generateThumbnail(filePath, thumbPath);

          const originalUpload = await uploadImageToS3(
            filePath,
            fileName,
            userId,
            venueId,
            file.mimetype,
            "venue",
          );

          const thumbUpload = await uploadImageToS3(
            thumbPath,
            thumbName,
            userId,
            venueId,
            "image/webp",
            "venue",
          );

          folderDp = {
            fileUrl: originalUpload.Location,
            thumbnailUrl: thumbUpload.Location,
            s3Key: originalUpload.Key,
            thumbnailKey: thumbUpload.Key,
          };
        } finally {
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
        folderName,
        category: "custom",
        createdBy: userId,
        folderDp,
        createdAt: new Date(),
      };

      venue.subFolders.push(newSubFolder);

      await venue.save();

      const savedSubFolder = venue.subFolders[venue.subFolders.length - 1];

      return sendResponse(
        res,
        201,
        false,
        "Venue subfolder created",
        savedSubFolder,
      );
    } catch (error) {
      console.error("Venue Subfolder Error:", error);
      return sendResponse(res, 500, true, "Server error");
    }
  },
);

router.put("/venue/assign-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({
        message: "subFolderId is required",
      });
    }

    // ================= ADD IMAGES =================
    if (addImageIds.length > 0) {
      await VenueImages.updateMany(
        { _id: { $in: addImageIds } },
        { $addToSet: { folderIds: subFolderId } },
      );
    }

    // ================= REMOVE IMAGES =================
    if (removeImageIds.length > 0) {
      await VenueImages.updateMany(
        { _id: { $in: removeImageIds } },
        { $pull: { folderIds: subFolderId } },
      );
    }

    return res.status(200).json({
      message: "Venue folder updated successfully",
      added: addImageIds.length,
      removed: removeImageIds.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
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
      data.images.filter((img) =>
        img.folderIds?.some((id) => id.toString() === folderId),
      ) || [];

    // ✅ 👉 SORT (latest first)
    const sorted = filtered.sort((a, b) => b.createdAt - a.createdAt);

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
      img.folderIds?.some((id) => id.toString() === folder._id.toString()),
    ).length;

    return {
      ...folder,
      imageCount: count,
    };
  });

  res.json(folders);
});

module.exports = router;
