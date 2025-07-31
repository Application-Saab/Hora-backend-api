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

    // Check if a folder with the same name already exists for the same customer
    const existingFolder = await FolderModel.findOne({
      folderName,
      customerId,
    });
    if (existingFolder) {
      return res.status(400).json({
        message: `Folder with the name '${folderName}' already exists for this customer.`,
      });
    }

    // Create and save the folder
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
    console.log("Received request:", req.body);

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

    // Process all files concurrently
    const uploadPromises = req.files.map(async (file) => {
      try {
        const filePath = file.path;
        const fileName = file.filename;
        const thumbnailPath = `${filePath.replace(
          /\.(png|jpeg|jpg)$/i,
          ""
        )}_thumbnail.webp`;

        console.log(
          `Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`
        );

        // Generate Thumbnail (Parallel)
        const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

        // Upload Original Image (Parallel)
        const s3UploadPromise = uploadFileToS3(
          filePath,
          fileName,
          folderPath,
          phoneNo
        );

        await thumbnailPromise; // Ensure thumbnail is generated before uploading

        // Upload Thumbnail (Parallel)
        const thumbnailFileName = `thumb_${fileName.replace(
          /\.(png|jpeg|jpg)$/i,
          ""
        )}.webp`;
        const s3ThumbPromise = uploadFileToS3(
          thumbnailPath,
          thumbnailFileName,
          folderPath,
          phoneNo
        );

        // Wait for both uploads to complete
        const [s3Response, s3ThumbResponse] = await Promise.all([
          s3UploadPromise,
          s3ThumbPromise,
        ]);

        // Cleanup local files
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
    const { folderName, customerId, vendorId, phoneNo } = req.query;

    if (!folderName || !customerId) {
      return res
        .status(400)
        .json({ message: "Folder Name and Customer ID are required." });
    }

    let folderPath = vendorId
      ? `${folderName}_${customerId}_${vendorId}/`
      : `${folderName}_${customerId}/`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: folderPath.trim(),
    };

    const s3Response = await s3.listObjectsV2(params).promise();

    // Filter only thumbnails
    const thumbFiles = s3Response.Contents.filter((file) =>
      file.Key.includes("/thumb_")
    );

    // Parallel metadata fetching using Promise.all
    const metadataPromises = thumbFiles.map(async (file) => {
      try {
        const metadata = await s3
          .headObject({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: file.Key,
          })
          .promise();

        const filePhoneNo = metadata.Metadata && metadata.Metadata.phoneno;

        if (!phoneNo || filePhoneNo === phoneNo) {
          return {
            key: file.Key,
            url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`,
            phoneNo: filePhoneNo,
          };
        }
      } catch (err) {
        console.warn(`Metadata fetch failed for ${file.Key}:`, err.message);
        return null;
      }
    });

    const allResults = await Promise.all(metadataPromises);
    const filteredThumbnails = allResults.filter(Boolean); // remove nulls

    res.status(200).json({ thumbnails: filteredThumbnails });
  } catch (error) {
    console.error("Error fetching thumbnails:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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
      Prefix: baseKey, // This will list all variations of the image
    };

    const { Contents } = await s3.listObjectsV2(params).promise();

    if (!Contents.length) {
      return res.status(404).json({ message: "Original image not found" });
    }

    // Find the correct image (skip the .webp one)
    const originalFile = Contents.find((file) => !file.Key.endsWith(".webp"));

    if (!originalFile) {
      return res.status(404).json({ message: "Original image not found" });
    }

    // Construct the original image URL
    const originalImageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalFile.Key}`;

    res.status(200).json({ originalImageUrl });
  } catch (error) {
    console.error("Error fetching original image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

// const upload = multer({ dest: 'uploads/' });

const uploadToS3 = (filePath, fileName, folder, contentType) => {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${folder}/${fileName}`,
    Body: fileContent,
    ContentType: contentType,
    // ACL: 'public-read'
  };

  return s3.upload(params).promise();
};

router.post("/upload-template", upload.single("file"), async (req, res) => {
  try {
    const { category } = req.body;
    const file = req.file;
    console.log(
      "%c [ file ]-467",
      "font-size:13px; background:pink; color:#bf2c9f;",
      file
    );

    if (!file || !category) {
      return res
        .status(400)
        .json({ message: "File and category are required" });
    }

    const filePath = file.path;
    const originalName = path.parse(file.originalname).name;
    const folder = `templates/${category}`;

    const svgFileName = `${originalName}.svg`;
    const webpFileName = `${originalName}.webp`;

    // 1. Upload SVG to S3
    // const svgUpload = await uploadToS3(filePath, svgFileName, folder);
    const svgUpload = await uploadToS3(
      filePath,
      svgFileName,
      folder,
      "image/svg+xml"
    );

    // 2. Generate and upload WebP
    const webpPath = `${filePath}.webp`;
    // await sharp(filePath).webp().toFile(webpPath);
    await sharp(filePath).webp().toFile(webpPath);

    // const webpUpload = await uploadToS3(webpPath, webpFileName, folder);
    const webpUpload = await uploadToS3(
      webpPath,
      webpFileName,
      folder,
      "image/webp"
    );

    webpUpload.ContentType = "image/webp";

    // 3. Save in DB
    const savedTemplate = await TemplateMaster.create({
      fileName: file.originalname,
      svgUrl: svgUpload.Location,
      s3SvgKey: svgUpload.Key,
      webpUrl: webpUpload.Location,
      s3WebpKey: webpUpload.Key,
      category,
    });

    // Cleanup
    fs.unlinkSync(filePath);
    fs.unlinkSync(webpPath);

    res
      .status(201)
      .json({ message: "Template uploaded", template: savedTemplate });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get All templates
router.get("/templates", async (req, res) => {
  try {
    const templates = await TemplateMaster.find().sort({ createdAt: -1 });
    res.status(200).json({ templates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get templates by category
router.get("/templates/:category", async (req, res) => {
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

module.exports = router;
