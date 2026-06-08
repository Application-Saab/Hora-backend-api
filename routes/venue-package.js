const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Venues = require("../models/party-venue");
const VenuePackage = require("../models/venue-packages");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const {
  generateThumbnail,
  generateTemplateThumbnail,
} = require("../store/multerS3Config");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

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

// =============================================
// CREATE PACKAGE
// =============================================
router.post(
  "/create-package",
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
        venueId,
        title,
        subTitle,
        discountedPrice,
        actualPrice,
        maxGuests,
        packageItems,
        packageAddons,
        tag,
      } = req.body;

      if (!mongoose.Types.ObjectId.isValid(venueId)) {
        return res.status(400).json({
          error: true,
          message: "Invalid venueId",
        });
      }

      packageItems =
        typeof req.body.packageItems === "string"
          ? JSON.parse(req.body.packageItems)
          : req.body.packageItems;

      packageAddons =
        typeof req.body.packageAddons === "string"
          ? JSON.parse(req.body.packageAddons)
          : req.body.packageAddons;

      const venue = await Venues.findById(venueId);

      if (!venue) {
        return res.status(404).json({
          error: true,
          message: "Venue not found",
        });
      }

      const packageData = await VenuePackage.create({
        venueId,
        title,
        subTitle,
        discountedPrice,
        actualPrice,
        maxGuests,
        packageItems,
        packageAddons,
        tag,
      });

      if (req.file) {
        const webpFileName = `package-${Date.now()}.webp`;

        const webpPath =
          req.file.path.replace(/\.(png|jpg|jpeg)$/i, "") + ".webp";

        await generateTemplateThumbnail(req.file.path, webpPath);

        const venue = await Venues.findById(venueId);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          venue.userId.toString(),
          venueId,
          "image/webp",
          packageData._id,
          "package-images",
        );

        packageData.packageImageUrl = uploadResult.Location;

        packageData.packageImageKey = uploadResult.Key;

        await packageData.save();

        await Promise.all([
          deleteFileWithRetry(req.file.path),
          deleteFileWithRetry(webpPath),
        ]);
      }

      return res.status(201).json({
        error: false,
        message: "Package created successfully",
        data: packageData,
      });
    } catch (err) {
      console.log(err);

      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);

// =============================================
// GET ALL PACKAGES
// =============================================
router.get("/package-list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      venueId = "",
      packageStatus = "",
    } = req.query;

    const query = {
      packageStatus: {
        $ne: 3,
      },
    };

    if (search) {
      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          subTitle: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    if (venueId && mongoose.Types.ObjectId.isValid(venueId)) {
      query.venueId = venueId;
    }

    if (packageStatus) {
      query.packageStatus = Number(packageStatus);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const packages = await VenuePackage.find(query)
      .populate("venueId", "venueName venueType location")
      .populate("packageItems")
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await VenuePackage.countDocuments(query);

    return res.status(200).json({
      error: false,
      message: "Packages fetched successfully",
      data: packages,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// GET PACKAGE DETAILS
// =============================================
router.get("/package-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid package id",
      });
    }

    const packageData = await VenuePackage.findById(id)
      .populate("venueId", "venueName venueType location googleMapLink")
      .populate("packageItems")
      .lean();

    if (!packageData) {
      return res.status(404).json({
        error: true,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      error: false,
      message: "Package fetched successfully",
      data: packageData,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// UPDATE PACKAGE
// =============================================
router.put(
  "/package-details/:id",
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
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          error: true,
          message: "Invalid package id",
        });
      }

      const packageData = await VenuePackage.findById(id);

      if (!packageData) {
        return res.status(404).json({
          error: true,
          message: "Package not found",
        });
      }

      const {
        title,
        subTitle,
        discountedPrice,
        actualPrice,
        maxGuests,
        packageItems,
        packageAddons,
        packageStatus,
        tag,
      } = req.body;

      let parsedPackageItems =
        typeof packageItems === "string"
          ? JSON.parse(packageItems)
          : packageItems;

      let parsedPackageAddons =
        typeof packageAddons === "string"
          ? JSON.parse(packageAddons)
          : packageAddons;

      if (title !== undefined) packageData.title = title;

      if (subTitle !== undefined) packageData.subTitle = subTitle;

      if (discountedPrice !== undefined)
        packageData.discountedPrice = discountedPrice;

      if (actualPrice !== undefined) packageData.actualPrice = actualPrice;

      if (maxGuests !== undefined) packageData.maxGuests = maxGuests;

      if (parsedPackageItems !== undefined)
        packageData.packageItems = parsedPackageItems;

      if (parsedPackageAddons !== undefined)
        packageData.packageAddons = parsedPackageAddons;

      if (packageStatus !== undefined)
        packageData.packageStatus = packageStatus;

      if (tag !== undefined) packageData.tag = tag;

      if (req.file) {
        if (packageData.packageImageKey) {
          await deleteFromS3(packageData.packageImageKey);
        }

        const venue = await Venues.findById(packageData.venueId);

        const webpFileName = `package-${Date.now()}.webp`;

        const webpPath =
          req.file.path.replace(/\.(png|jpg|jpeg)$/i, "") + ".webp";

        await generateTemplateThumbnail(req.file.path, webpPath);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          venue.userId.toString(),
          venue._id.toString(),
          "image/webp",
          packageData._id,
          "package-images",
        );

        packageData.packageImageUrl = uploadResult.Location;

        packageData.packageImageKey = uploadResult.Key;

        await Promise.all([
          deleteFileWithRetry(req.file.path),
          deleteFileWithRetry(webpPath),
        ]);
      }

      const updated = await packageData.save();

      return res.status(200).json({
        error: false,
        message: "Package updated successfully",
        data: updated,
      });
    } catch (err) {
      console.log(err);

      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);

// =============================================
// DELETE PACKAGE
// =============================================
router.delete("/package-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid package id",
      });
    }

    const packageData = await VenuePackage.findById(id);

    if (!packageData) {
      return res.status(404).json({
        error: true,
        message: "Package not found",
      });
    }

    packageData.packageStatus = 3;

    await packageData.save();

    return res.status(200).json({
      error: false,
      message: "Package deleted successfully",
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// GET PACKAGES BY VENUE ID
// =============================================
router.get("/packages-by-venue-admin/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({
        error: true,
        message: "Invalid venue id",
      });
    }

    const packages = await VenuePackage.find({
      venueId,
      packageStatus: {
        $ne: 3,
      },
    })
      .populate("packageItems")
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      error: false,
      message: "Venue packages fetched successfully",
      data: packages,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

router.patch("/venue-package-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { packageStatus } = req.body;

    // -------------------------
    // Validate ID
    // -------------------------
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid package ID",
        error: true,
      });
    }

    // -------------------------
    // Allow ONLY 1 or 2
    // -------------------------
    if (![1, 2].includes(packageStatus)) {
      return res.status(400).json({
        message: "Invalid status. Use 1 (active) or 2 (inactive)",
        error: true,
      });
    }

    // -------------------------
    // Find package
    // -------------------------
    const packageData = await VenuePackage.findById(id);

    if (!packageData) {
      return res.status(404).json({
        message: "Package not found",
        error: true,
      }); 
    }

    // -------------------------
    // Update status
    // -------------------------
    packageData.packageStatus = packageStatus;

    await packageData.save();

    return res.status(200).json({
      message: "Package status updated successfully",
      error: false,
      data: packageData,
    });
  } catch (err) {
    console.error("Package status update error:", err);

    return res.status(500).json({
      message: "Server error",
      error: true,
    });
  }
});

router.get("/packages-by-venue/:venueId", async (req, res) => {
  try {
    const { venueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({
        error: true,
        message: "Invalid venue id",
      });
    }

    const packages = await VenuePackage.find({
      venueId,
      packageStatus: {
        $ne: 2,
      },
    })
      .populate("packageItems")
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      error: false,
      message: "Venue packages fetched successfully",
      data: packages,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

module.exports = router;
