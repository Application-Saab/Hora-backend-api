const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const OrderModel = require("../models/order");
const FolderModel = require("../models/folder");
const {
  generateThumbnail,
  uploadFileToS3,
} = require("../store/multerS3Config");
const fsp = require("fs").promises;

const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

// Helper: Extract folder ID from Google Drive URL
function getFolderIdFromUrl(url) {
  const regex = /\/folders\/([a-zA-Z0-9_-]+)(\?.*)?$/;
  const match = url.match(regex);
  return match ? match[1] : null;
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

// Helper: Check if folder is publicly accessible
async function isFolderPubliclyAccessible(folderId, apiKey) {
  try {
    // Try fetching folder metadata to check permissions
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=permissions&key=${apiKey}`;
    const response = await axios.get(metadataUrl);

    const permissions = response.data.permissions || [];

    // Check for "anyoneWithLink" permission (viewer, reader, or writer)
    if (permissions.length > 0) {
      const isPublic = permissions.some(
        (perm) =>
          perm.type === "anyone" &&
          (perm.role === "viewer" ||
            perm.role === "reader" ||
            perm.role === "writer")
      );
      if (isPublic) return true;
    }

    // Fallback: Try listing files to confirm public access
    const testUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false&key=${apiKey}&fields=files(id)`;
    await axios.get(testUrl);
    console.log(
      "%c [ Fallback Test Success ]",
      "font-size:13px; background:green; color:#fff;"
    );
    return true; // If testUrl succeeds, assume folder is public
  } catch (error) {
    if (error.response && error.response.status === 403) {
      return false; // Explicitly not public
    }
    return false; // Assume not public for other errors
  }
}


router.post("/import-drive-folder", async (req, res) => {
  try {
    let { folderUrl, vendorId } = req.body;

    // Validate request
    if (!folderUrl || !vendorId) {
      return res
        .status(400)
        .json({ message: "Folder URL and Vendor ID are required." });
    }

    const folderId = getFolderIdFromUrl(folderUrl);
    if (!folderId) {
      return res
        .status(400)
        .json({ message: "Invalid Google Drive folder URL" });
    }

    if (!apiKey) {
      return res
        .status(500)
        .json({ message: "Google Drive API key not configured" });
    }

    // Check if the folder is publicly accessible
    const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
    if (!isPublic) {
      return res
        .status(400)
        .json({
          message: "Google Drive folder link is not publicly accessible.",
        });
    }

    const order = await OrderModel.findOne({ order_id: vendorId - 10800 });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const customerId = order.fromId;
    const phoneNo = order.phone_no;
    const folderName = `${vendorId}`;

    let existingFolder = await FolderModel.findOne({
      folderName,
      customerId,
    });

    if (!existingFolder) {
      const folder = new FolderModel({ folderName, customerId, vendorId });
      await folder.save();
      existingFolder = folder;
    }

    // Create temp directory
    const tempDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // List all image files in the folder using Google Drive API
    let files = [];
    let pageToken = null;
    do {
      let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false%20and%20mimeType%20contains%20'image/'&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
      if (pageToken) listUrl += `&pageToken=${pageToken}`;
      const listRes = await axios.get(listUrl);
      files = files.concat(listRes.data.files);
      pageToken = listRes.data.nextPageToken;
    } while (pageToken);

    if (files.length === 0) {
      return res.status(404).json({ message: "No images found in the folder" });
    }

    let folderPath = vendorId
      ? `${folderName}_${customerId}`
      : `${folderName}_${customerId}`;

    // Process all files concurrently
    const uploadPromises = files.map(async (file) => {
      try {
        const originalName = file.name;
        const fileName = `${Date.now()}_${originalName}`; // Match /upload naming: ${Date.now()}_${originalName}
        const filePath = path.join(tempDir, fileName);
        const thumbnailPath = path.join(
          tempDir,
          `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
        );

        // Download from Google Drive
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
        await downloadFile(downloadUrl, filePath);

        console.log(
          `Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`
        );

        // Generate Thumbnail
        const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

        // Upload Original Image
        const s3UploadPromise = uploadFileToS3(
          filePath,
          fileName,
          folderPath,
          phoneNo
        );

        await thumbnailPromise;

        // Upload Thumbnail
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

        // Cleanup local files (async with error handling)
        try {
          await fsp.unlink(filePath);
        } catch (unlinkError) {
          console.error(
            `Error deleting local file ${filePath}:`,
            unlinkError.message
          );
        }
        try {
          await fsp.unlink(thumbnailPath);
        } catch (unlinkError) {
          console.error(
            `Error deleting local thumbnail ${thumbnailPath}:`,
            unlinkError.message
          );
        }

        return {
          fileName: originalName,
          fileUrl: s3Response.Location,
          s3Key: s3Response.Key,
          thumbnailUrl: s3ThumbResponse.Location,
          thumbnailKey: s3ThumbResponse.Key,
        };
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = path.join(tempDir, fileName);
        const thumbnailPath = path.join(
          tempDir,
          `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
        );
        try {
          if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath);
          }
          if (fs.existsSync(thumbnailPath)) {
            await fsp.unlink(thumbnailPath);
          }
        } catch (unlinkError) {
          console.error(
            `Error deleting local files in error case:`,
            unlinkError.message
          );
        }
        return { fileName: file.name, error: error.message };
      }
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;

    await OrderModel.updateOne(
      { order_id: vendorId - 10800 },
      { $set: { orderGalleryLink, orderDriveLink: folderUrl } }
    );

    res.status(201).json({
      message: "Files uploaded successfully from Google Drive.",
      files: uploadedFiles,
      folderDetails: {
        folderName,
        customerId,
        vendorId,
        phoneNo,
        order_date: order.order_date,
      },
    });
  } catch (error) {
    console.error("Drive Upload error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    // Cleanup temp directory if empty
    const tempDir = path.join(__dirname, "uploads");
    try {
      const files = await fsp.readdir(tempDir);
      if (files.length === 0) {
        await fsp.rmdir(tempDir);
      }
    } catch (error) {
      console.error(
        `Error cleaning up temp directory ${tempDir}:`,
        error.message
      );
    }
  }
});


router.post("/update-google-sheet", async (req, res) => {
  try {
    const googleResp = await axios.post(
      "https://script.google.com/macros/s/AKfycbzoU9skjFIqA4yKQMfF4Tuh1uhYhk_vNfKjH5pEt4ZRtd9T_ouGSw_SYPiluq3zj62E/exec",
      req.body,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    res.json(googleResp.data); // axios se data direct milega
  } catch (err) {
    console.error("Google Sheet update error:", err.message);
    res.status(500).json({ error: "Failed to update Google Sheet" });
  }
});


// Script That written in google sheet create script section for sync
// function doPost(e) {
//   try {
//     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Photography Order");
//     const data = JSON.parse(e.postData.contents);  // frontend/backend से भेजा गया JSON

//     sheet.appendRow([
//       data.orderIdDb,
//       data.orderIdCustomer,
//       data.phone,
//       data.fulfillmentDate,
//       data.services,
//       data.driveLink,
//       data.horaWebLink
//     ]);

//     return ContentService.createTextOutput(
//       JSON.stringify({ status: "success", rowAdded: true })
//     ).setMimeType(ContentService.MimeType.JSON);
//   } catch (err) {
//     return ContentService.createTextOutput(
//       JSON.stringify({ status: "error", message: err.message })
//     ).setMimeType(ContentService.MimeType.JSON);
//   }
// }



module.exports = router;
