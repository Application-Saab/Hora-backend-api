const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");
const DriveImportedImages = require("../models/driveImportedImages"); // Adjust path if needed
const { generateThumbnail } = require("../store/multerS3Config"); // From your existing code

// AWS S3 Configuration (copied from your existing code)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

// Helper: Extract folder ID from Google Drive URL
function getFolderIdFromUrl(url) {
  const regex = /\/folders\/([a-zA-Z0-9_-]+)(\?.*)?$/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Helper: Upload image to S3 (adapted from your existing uploadImageToS3)
async function uploadImageToS3(filePath, fileName, userId, mimeType) {
  const folderName = "drive-imported"; // New folder in S3 for these images
  const key = `${folderName}/${userId}/${fileName}`;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: mimeType,
  };
  const data = await s3.upload(params).promise();
  return { Location: data.Location, Key: data.Key };
}

// Helper: Download file from URL to local path
async function downloadFile(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Endpoint: Import images from Google Drive public folder
router.post("/import-drive-folder", async (req, res) => {
  const { userId, folderUrl } = req.body;

  // Validation
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: true, message: "Invalid user ID" });
  }
  if (!folderUrl) {
    return res
      .status(400)
      .json({ error: true, message: "Folder URL is required" });
  }

  const folderId = getFolderIdFromUrl(folderUrl);
  if (!folderId) {
    return res
      .status(400)
      .json({ error: true, message: "Invalid Google Drive folder URL" });
  }


  if (!apiKey) {
    return res
      .status(500)
      .json({ error: true, message: "Google Drive API key not configured" });
  }

  try {
    // List all image files in the folder using Google Drive API
    let files = [];
    let pageToken = null;
    do {
      let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
      if (pageToken) listUrl += `&pageToken=${pageToken}`;
      const listRes = await axios.get(listUrl);
      files = files.concat(
        listRes.data.files.filter((f) => f.mimeType.startsWith("image/"))
      );
      pageToken = listRes.data.nextPageToken;
    } while (pageToken);

    if (files.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: "No images found in the folder" });
    }

    // Process each image: Download, generate thumbnail, upload to S3
    const importedImages = [];
    const tempDir = "./uploads/";
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    for (const file of files) {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
      const filePath = path.join(tempDir, file.name);
      await downloadFile(downloadUrl, filePath);

      // Generate thumbnail
      const thumbnailPath = path.join(
        tempDir,
        `thumb_${path.basename(file.name, path.extname(file.name))}.webp`
      );
      await generateThumbnail(filePath, thumbnailPath);

      // Upload original and thumbnail to S3
      const mimeType = file.mimeType;
      const originalName = file.name;
      const fileName = `${Date.now()}-${originalName}`;
      const thumbnailFileName = `thumb_${fileName.replace(
        /\.[^/.]+$/,
        ""
      )}.webp`;

      const [uploadResult, thumbnailUploadResult] = await Promise.all([
        uploadImageToS3(filePath, fileName, userId, mimeType),
        uploadImageToS3(thumbnailPath, thumbnailFileName, userId, "image/webp"),
      ]);

      importedImages.push({
        originalName,
        url: uploadResult.Location,
        key: uploadResult.Key,
        thumbnailUrl: thumbnailUploadResult.Location,
        thumbnailKey: thumbnailUploadResult.Key,
      });

      // Cleanup temp files
      fs.unlinkSync(filePath);
      fs.unlinkSync(thumbnailPath);
    }

    // Store in MongoDB (append to existing document if user already has one)
    let doc = await DriveImportedImages.findOne({ userId });
    if (!doc) {
      doc = new DriveImportedImages({ userId, images: [] });
    }
    doc.images.push(...importedImages);
    await doc.save();

    return res
      .status(200)
      .json({
        error: false,
        message: "Images imported and stored successfully",
        data: doc,
      });
  } catch (err) {
    console.error("Import Error:", err);
    return res.status(500).json({ error: true, message: "Server error" });
  }
});

// Endpoint: Get all images for a user by userId
router.get("/drive-imported-images/:userId", async (req, res) => {
  const { userId } = req.params;

  // Validation
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: true, message: "Invalid user ID" });
  }

  try {
    // Find the document for the user
    const doc = await DriveImportedImages.findOne({ userId }).lean();
    if (!doc || !doc.images || doc.images.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: "No images found for this user" });
    }

    // Sort images by createdAt in descending order (newest first)
    const sortedImages = doc.images.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      error: false,
      message: "Images fetched successfully",
      data: {
        userId,
        images: sortedImages,
        totalImages: sortedImages.length,
      },
    });
  } catch (err) {
    console.error("Fetch Images Error:", {
      message: err.message,
      stack: err.stack,
      userId,
    });
    return res.status(500).json({
      error: true,
      message: "Server error",
      details: err.message,
    });
  }
});

module.exports = router;
