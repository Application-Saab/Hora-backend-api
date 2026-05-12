const express = require("express");
const mongoose = require("mongoose");
const FolderModel = require("./../models/folder"); // Import the Folder model
const TemplateMaster = require("../models/uploadEventTemplate");
const {
  upload,
  uploadFileToS3,
  generateThumbnail,
} = require("../store/multerS3Config");
const router = express.Router();
const fs = require("fs");
const AWS = require("aws-sdk");
const path = require("path");
const sharp = require("sharp");
const WebLink = require("../models/weblink-images");
const multer = require("multer");
const UserModel = require("../models/user")

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Create a folder (POST /api/folders)
router.post("/CreateFolder", async (req, res) => {
  try {
    const { folderName, customerId, vendorId } = req.body;

    // Validate request
    if (!folderName || !customerId) {
      return res
        .status(400)
        .json({ message: "Folder Name and Customer ID are required" });
    }

    // Check for duplicate folder
    const existingFolder = await FolderModel.findOne({
      folderName,
      customerId,
    });

    if (existingFolder) {
      return res.status(400).json({
        message: `Folder with the name '${folderName}' already exists for this customer.`,
      });
    }

    // Create and save folder
    const folder = new FolderModel({ folderName, customerId, vendorId });
    await folder.save();

    res.status(201).json({ message: "Folder created successfully.", folder });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete a folder (DELETE /api/photo/DeleteFolder)
router.post("/DeleteFolder", async (req, res) => {
  try {
    const { folderName } = req.body;
    const { customerId } = req.body; // assuming customerId is needed to validate the request

    // Validate request
    if (!folderName || !customerId) {
      return res
        .status(400)
        .json({ message: "Folder Name and Customer ID are required" });
    }

    // Check if the folder exists for the given customerId
    const folder = await FolderModel.findOne({ folderName, customerId });
    if (!folder) {
      return res.status(404).json({
        message: `Folder with the name '${folderName}' not found for this customer.`,
      });
    }

    // Delete the folder
    await FolderModel.deleteOne({ folderName, customerId });

    res
      .status(200)
      .json({ message: `Folder '${folderName}' deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/DeleteFolder", async (req, res) => {
  try {
    const { folderName, customerId, vendorId } = req.body;

    // Validate request
    if (!folderName || !customerId) {
      return res
        .status(400)
        .json({ message: "Folder Name and Customer ID are required" });
    }

    // Check if the folder exists for the given customerId and vendorId
    const query = { folderName, customerId };
    if (vendorId) {
      query.vendorId = vendorId;
    }

    const folder = await FolderModel.findOne(query);
    if (!folder) {
      return res.status(404).json({
        message: `Folder with the name '${folderName}' not found for this customer.`,
      });
    }

    // Delete folder from MongoDB
    await FolderModel.deleteOne(query);

    // Delete folder from S3
    let s3FolderPath = `${folderName}_${customerId}`;
    if (vendorId) {
      s3FolderPath += `_${vendorId}`;
    }
    s3FolderPath += "/";

    // List all objects in the folder
    const listParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME, // Replace with your bucket name
      Prefix: s3FolderPath,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (listedObjects.Contents.length > 0) {
      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Delete: {
          Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
        },
      };

      await s3.deleteObjects(deleteParams).promise();
    }

    res.status(200).json({
      message: `Folder '${folderName}' deleted successfully from both database and S3.`,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update folder name (PUT /api/folders/:folderName)
router.post("/UpdateFolder", async (req, res) => {
  try {
    const { folderName } = req.body; // Old folder name from the URL
    const { newFolderName, customerId } = req.body; // New folder name and customerId from request body

    // Validate request
    if (!newFolderName || !customerId) {
      return res
        .status(400)
        .json({ message: "New Folder Name and Customer ID are required" });
    }

    // Check if the folder exists for the given customerId
    const folder = await FolderModel.findOne({ folderName, customerId });
    if (!folder) {
      return res.status(404).json({
        message: `Folder with the name '${folderName}' not found for this customer.`,
      });
    }

    // Check if a folder with the new name already exists for the same customer
    const existingFolder = await FolderModel.findOne({
      folderName: newFolderName,
      customerId,
    });
    if (existingFolder) {
      return res.status(400).json({
        message: `Folder with the name '${newFolderName}' already exists for this customer.`,
      });
    }

    // Update the folder name
    folder.folderName = newFolderName;
    await folder.save();

    res
      .status(200)
      .json({ message: `Folder name updated successfully.`, folder });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all folders by customerId (GET /api/folders/:customerId)
router.get("/GetFoldersByCustomerId/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;

    // Validate request
    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    // Find all folders for the given customerId
    const folders = await FolderModel.find({ customerId });

    if (folders.length === 0) {
      return res.status(404).json({
        message: `No folders found for customer with ID '${customerId}'`,
      });
    }

    res
      .status(200)
      .json({ message: "Folders retrieved successfully.", folders });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/upload", upload.array("files", 300), async (req, res) => {
  try {
    const { folderName, customerId, vendorId, phoneNo } = req.body;

    if (!folderName || !customerId) {
      return res
        .status(400)
        .json({ message: "Folder Name and Customer ID are required." });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files were uploaded." });
    }

    let folderPath = vendorId
      ? `${folderName}_${customerId}_${vendorId}`
      : `${folderName}_${customerId}`;

    const uploadPromises = req.files.map(async (file) => {
      try {
        const filePath = file.path;
        const fileName = file.filename;

        const thumbnailPath = `${filePath.replace(
          /\.(png|jpeg|jpg)$/i,
          "",
        )}_thumbnail.webp`;

        console.log(
          `Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`,
        );

        // Generate thumbnail
        const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

        // Upload original file
        const s3UploadPromise = uploadFileToS3(
          filePath,
          fileName,
          folderPath,
          phoneNo,
        );

        await thumbnailPromise;

        // Upload thumbnail
        const thumbFileName = `thumb_${fileName.replace(
          /\.(png|jpeg|jpg)$/i,
          "",
        )}.webp`;

        const s3ThumbPromise = uploadFileToS3(
          thumbnailPath,
          thumbFileName,
          folderPath,
          phoneNo,
        );

        const [s3Response, s3ThumbResponse] = await Promise.all([
          s3UploadPromise,
          s3ThumbPromise,
        ]);

        // Remove local temp files
        fs.unlinkSync(filePath);
        fs.unlinkSync(thumbnailPath);

        return {
          fileName: file.originalname,
          fileUrl: s3Response.Location,
          s3Key: s3Response.Key,
          thumbnailUrl: s3ThumbResponse.Location,
          thumbnailKey: s3ThumbResponse.Key,
        };
      } catch (error) {
        console.error(`Error processing ${file.filename}:`, error);
        return { fileName: file.originalname, error: error.message };
      }
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.status(201).json({
      message: "Files uploaded successfully.",
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/thumbnailsWithinProject", async (req, res) => {
  try {
    const { folderName, customerId } = req.query;

    if (!folderName) {
      return res.status(400).json({
        message: "folderName is required.",
      });
    }

    const folderNames = folderName.split(",");

    const folders = await FolderModel.find({
      folderName: { $in: folderNames },
    }).lean();

    if (!folders.length) {
      return res.status(404).json({
        message: "No folders found.",
      });
    }

    const userIds = folders.flatMap(f => f.viewedBy || []);
    const uniqueUserIds = [...new Set(userIds)];

const users = await UserModel.find({
  _id: { $in: uniqueUserIds }
})
.select("_id name firstName lastName phone avatar")
.lean();

const userMap = {};
users.forEach(u => {
  userMap[String(u._id)] = u;
});


const enrichedFolders = folders.map(folder => ({
  ...folder,
  guestDetails: (folder.viewedBy || []).map(id => userMap[id] || {
    _id: id,
    name: "Unknown User",
    phone: "",
    avatar: ""
  })
}));

    const folderIds = folders.map((f) => f._id);

    const images = await WebLink.find({
      mainFolderId: { $in: folderIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    const thumbnails = images.map((img) => ({
      ...img,
    }));

    /* =========================
           4Final Response
        ========================= */
    res.status(200).json({
      folders:enrichedFolders,
      thumbnails,
    });
  } catch (error) {
    console.error("Error fetching thumbnails:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.get("/originalImage", async (req, res) => {
  try {
    const { thumbnailKey } = req.query;

    if (!thumbnailKey) {
      return res.status(400).json({ message: "Thumbnail key is required." });
    }

    // Extract base file name (remove the 'thumb_' prefix and .webp extension)
    const baseKey = thumbnailKey.replace("/thumb_", "/").replace(/\.webp$/, "");

    // List objects in the same folder
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: baseKey, // list all variations of the image
    };

    const data = await s3.listObjectsV2(params).promise();
    const Contents = data.Contents || [];

    if (!Contents.length) {
      return res.status(404).json({ message: "Original image not found" });
    }

    // Find the original image (skip the .webp one)
    const originalFile = Contents.find((file) => !file.Key.endsWith(".webp"));

    if (!originalFile) {
      return res.status(404).json({ message: "Original image not found" });
    }

    // Construct the original image URL
    const originalImageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalFile.Key}`;

    return res.status(200).json({ originalImageUrl });
  } catch (error) {
    console.error("Error fetching original image:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

router.post("/deleteImage", async (req, res) => {
  try {
    const { thumbnailKey } = req.body;

    if (!thumbnailKey) {
      return res.status(400).json({ message: "Thumbnail key is required." });
    }

    // Derive the original image key
    const originalKey = thumbnailKey
      .replace("/thumb_", "/")
      .replace(/_thumbnail\.webp$|\.webp$/i, "");

    const objectsToDelete = [{ Key: thumbnailKey }, { Key: originalKey }];

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Delete: {
        Objects: objectsToDelete,
      },
    };

    const deleteResponse = await s3.deleteObjects(params).promise();

    res.status(200).json({
      message: "Thumbnail and original image deleted successfully.",
      deleted: deleteResponse.Deleted,
      errors: deleteResponse.Errors,
    });
  } catch (error) {
    console.error("Error deleting image pair:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

const uploadToS3 = (filePath, fileName, folder, contentType) => {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${folder}/${fileName}`,
    Body: fileContent,
    ContentType: contentType,
  };

  return s3.upload(params).promise();
};

async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

// Template local upload
const templateUploadPath = path.join(__dirname, "../uploads/templates");

// Ensure directory exists
if (!fs.existsSync(templateUploadPath)) {
  fs.mkdirSync(templateUploadPath, { recursive: true });
}

const templateMulter = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      if (file.fieldname === "bgImage") {
        cb(null, path.join(__dirname, "../uploads/templates"));
      } else {
        cb(null, path.join(__dirname, "../uploads")); 
      }
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const baseName = path
        .basename(file.originalname, ext)
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-_]/g, "");

      cb(null, `${baseName}${ext}`);
    },
  }),
});

// Upload new templates
router.post(
  "/upload-template",
  templateMulter.fields([
    { name: "previewImage", maxCount: 1 },
    { name: "bgImage", maxCount: 1 },
  ]),
  async (req, res) => {
    let previewFilePath = null;
    let webpPath = null;
    let bgFilePath = null;

    try {
      const { category, ...configs } = req.body;
      const previewFile = req.files?.previewImage?.[0];
      const bgFile = req.files?.bgImage?.[0];

      if (!previewFile || !category) {
        return res.status(400).json({
          message: "previewImage and category are required",
        });
      }

      previewFilePath = previewFile.path;
      if (bgFile) bgFilePath = bgFile.path;

      const mime = previewFile.mimetype;
      const isAnimated = mime === "image/gif" || mime.startsWith("video/");
      const folder = `templates/${category}`;

      let previewUrl, previewKey;

      // === Preview File Handling ===
      if (isAnimated) {
        console.log('%c [ isAnimated ]', 'font-size:13px; background:pink; color:#bf2c9f;', isAnimated)
        // GIF ya Video → Direct S3 Upload (No WebP)
        const uploadResult = await uploadToS3(
          previewFilePath,
          previewFile.filename,
          folder,
          mime
        );
        previewUrl = uploadResult.Location;
        previewKey = uploadResult.Key;
      } else {
        // Normal Image (jpg, png, etc.) → WebP Conversion
        const previewOriginalName = path.parse(previewFile.originalname).name;
        webpPath = `${previewFilePath}.webp`;

        await sharp(previewFilePath).webp({ quality: 85 }).toFile(webpPath);

        const webpFileName = `${previewOriginalName}.webp`;
        const webpUpload = await uploadToS3(
          webpPath,
          webpFileName,
          folder,
          "image/webp"
        );

        previewUrl = webpUpload.Location;
        previewKey = webpUpload.Key;
      }

      // === Background File ===
      if (bgFile) {
        configs.bgImageName = bgFile.filename;
      }

      // Save to Database
      const savedTemplate = await TemplateMaster.create({
        fileName: previewFile.originalname,
        webpUrl: previewUrl,
        s3WebpKey: previewKey,
        category,
        configs,
        isVideo: mime.startsWith("video/"),     // true only for real videos
        isAnimated: isAnimated,                 // GIF + Video ke liye
        mimeType: mime
      });

      // === Safe Cleanup with delay ===
      setTimeout(() => {
        try {
          if (previewFilePath && fs.existsSync(previewFilePath)) {
            fs.unlinkSync(previewFilePath);
          }
          if (webpPath && fs.existsSync(webpPath)) {
            console.log('%c [ webpPath ]', 'font-size:13px; background:pink; color:#bf2c9f;', webpPath)
            fs.unlinkSync(webpPath);
          }
          // if (bgFilePath && fs.existsSync(bgFilePath)) {
          //   fs.unlinkSync(bgFilePath);
          // }
        } catch (cleanupErr) {
          console.warn("Cleanup warning:", cleanupErr.message);
        }
      }, 1000);

      res.status(201).json({
        message: "Template uploaded successfully",
        template: savedTemplate,
      });

    } catch (error) {
      console.error("Upload template error:", error);
      res.status(500).json({ 
        message: "Server error", 
        error: error.message 
      });
    }
  }
);

// Update event templates
router.put(
  "/update-template/:id",
  templateMulter.fields([
    { name: "previewImage", maxCount: 1 },
    { name: "bgImage", maxCount: 1 },
  ]),
  async (req, res) => {
    let previewFilePath = null;
    let webpPath = null;
    let bgFilePath = null;

    try {
      const { id } = req.params;
      const { category, ...newConfigsFromBody } = req.body;

      const previewFile = req.files?.previewImage?.[0];
      const bgFile = req.files?.bgImage?.[0];

      const template = await TemplateMaster.findById(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const updateData = {};

      // Category
      if (category) {
        updateData.category = category;
      }

      // === Preview File Update ===
      if (previewFile) {
        const mime = previewFile.mimetype;
        const isAnimated = mime === "image/gif" || mime.startsWith("video/");
        previewFilePath = previewFile.path;

        // Purani S3 file delete
        if (template.s3WebpKey) {
          try { await deleteFromS3(template.s3WebpKey); } catch (e) {}
        }

        const folder = `templates/${category || template.category}`;
        let previewUrl, previewKey;

        if (isAnimated) {
          const uploadResult = await uploadToS3(previewFilePath, previewFile.filename, folder, mime);
          previewUrl = uploadResult.Location;
          previewKey = uploadResult.Key;
        } else {
          const previewOriginalName = path.parse(previewFile.originalname).name;
          webpPath = `${previewFilePath}.webp`;

          await sharp(previewFilePath).webp({ quality: 85 }).toFile(webpPath);

          const webpFileName = `${previewOriginalName}.webp`;
          const webpUpload = await uploadToS3(webpPath, webpFileName, folder, "image/webp");

          previewUrl = webpUpload.Location;
          previewKey = webpUpload.Key;
        }

        updateData.fileName = previewFile.originalname;
        updateData.webpUrl = previewUrl;
        updateData.s3WebpKey = previewKey;
        updateData.isVideo = mime.startsWith("video/");
        updateData.isAnimated = isAnimated;
        updateData.mimeType = mime;
      }

      // === Background File Update (Sabse Important Fix) ===
      if (bgFile) {
        bgFilePath = bgFile.path;

        // Purani file delete
        if (template.configs?.bgImageName) {
          const oldPath = path.join(templateUploadPath, template.configs.bgImageName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        // ✅ Yeh line sabse important hai
        updateData["configs.bgImageName"] = bgFile.filename;
      }

      // Final Update
      const updatedTemplate = await TemplateMaster.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      // Safe Cleanup
      setTimeout(() => {
        try {
          if (previewFilePath && fs.existsSync(previewFilePath)) fs.unlinkSync(previewFilePath);
          if (webpPath && fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
          // if (bgFilePath && fs.existsSync(bgFilePath)) fs.unlinkSync(bgFilePath);
        } catch (e) {}
      }, 1000);

      res.status(200).json({
        message: "Template updated successfully",
        template: updatedTemplate,
      });

    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get all templates (limited fields)
router.get("/templates", async (req, res) => {
  try {
    const templates = await TemplateMaster.find(
      {},
      "_id webpUrl isDisabled category configs templateSize",
    ).sort({ createdAt: -1 });
    res.status(200).json({ templates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get single template by ID (full data)
router.get("/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid template ID" });
    }

    const template = await TemplateMaster.findById(id);

    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    return res.status(200).json({ success: true, template });
  } catch (error) {
    console.error("Error fetching template by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Get templates by category
router.get("/templates/category/:category", async (req, res) => {
  const { category } = req.params;
  try {
    const templates = await TemplateMaster.find({ category }).sort({
      createdAt: -1,
    });
    res.status(200).json({ templates });
  } catch (error) {
    console.error("Error fetching templates by category:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete image from S3 by key
router.post("/delete-image-by-key", async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res
        .status(400)
        .json({ success: false, message: "Image key is required" });
    }

    await deleteFromS3(key);

    return res.status(200).json({
      success: true,
      message: `Image deleted successfully from S3 (key: ${key})`,
    });
  } catch (error) {
    console.error("Error deleting from S3:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete image",
      error: error.message,
    });
  }
});

module.exports = router;
