const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const Venues = require("../models/party-venue");
const User = require("../models/user"); // ✅ added
const VenueVisitors = require("../models/venue-visitors"); // ✅ added
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const VenueImages = require("../models/venueImages");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });


//  created veune for party hall
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

// fetch venue details by id
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

// update venue details by id
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

// Venue visited by user(Registering a visit to the venue)
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

// get all visitors of a venue
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


// Generate presigned URL for uploading
router.post("/get-presigned-url", async (req, res) => {
  try {
    const {
      fileName,
      fileType,
      userId,
      venueId,
      folderId = null, // ✅ NEW
    } = req.body;

    if (!fileName || !fileType || !userId || !venueId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Build correct S3 path
    let key;

    if (folderId) {
      key = `venue-images/${userId}/${venueId}/${folderId}/${Date.now()}-${fileName}`;
    } else {
      key = `venue-images/${userId}/${venueId}/general/${Date.now()}-${fileName}`;
    }

    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: fileType,
      Expires: 300,
    };

    const uploadURL = await s3.getSignedUrlPromise("putObject", params);

    const fileUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return res.json({ uploadURL, key, fileUrl });
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Save images after S3 upload
router.post("/venue-images/upload/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;
    const { userId, images, folderId = null } = req.body;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({ message: "Invalid venueId" });
    }

    if (folderId && !mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({ message: "Invalid folderId" });
    }

    // ✅ CHECK 1: images array exists
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Images array required" });
    }

    // ✅ 👉 ADD VALIDATION HERE (THIS IS THE RIGHT PLACE)
    for (const img of images) {
      if (!img.imageUrl || !img.imageKey) {
        return res.status(400).json({ message: "Invalid image data" });
      }
    }

    // ✅ Validate folder if provided
    if (folderId) {
      const venue = await Venues.findById(venueId);
      const folder = venue?.subFolders.id(folderId);

      if (!venue || !folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
    }

    // ✅ FORMAT AFTER VALIDATION
    const formattedImages = images.map((img) => ({
      name: img.name || "",
      imageUrl: img.imageUrl,
      imageKey: img.imageKey,
      thumbnailUrl: img.thumbnailUrl || "",
      thumbnailKey: img.thumbnailKey || "",
      folderId: folderId || null,
      uploadedBy: userId,
    }));

    const updated = await VenueImages.findOneAndUpdate(
      { venueId },
      { $push: { images: { $each: formattedImages } } },
      { new: true, upsert: true }
    );

    // ✅ Update folder count
    if (folderId) {
      await Venues.updateOne(
        { _id: venueId, "subFolders._id": folderId },
        { $inc: { "subFolders.$.imageCount": images.length } }
      );
    }

    return res.status(201).json({
      message: "Images saved successfully",
      data: updated.images,
    });

  } catch (err) {
    console.error("Save images error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

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

// create folder inside venue
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

    // ✅ LIMIT
    if (venue.subFolders.length >= 50) {
      return res.status(400).json({ message: "Max 50 folders allowed" });
    }

    // ✅ FINAL NAME
    const finalName = (folderName || "Untitled Folder").trim();

    // ✅ DUPLICATE CHECK
    const exists = venue.subFolders.some(
      (f) => f.folderName.toLowerCase() === finalName.toLowerCase()
    );

    if (exists) {
      return res.status(409).json({ message: "Folder already exists" });
    }

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
        (img) => img.folderId?.toString() === folderId
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


module.exports = router;