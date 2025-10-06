// const express = require("express");
// const router = express.Router();
// const axios = require("axios");
// const fs = require("fs");
// const path = require("path");
// const OrderModel = require("../models/order");
// const FolderModel = require("../models/folder");
// const {
//   generateThumbnail,
//   uploadFileToS3,
// } = require("../store/multerS3Config");
// const fsp = require("fs").promises;

// const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

// // Helper: Extract folder ID from Google Drive URL
// function getFolderIdFromUrl(url) {
//   const regex = /\/folders\/([a-zA-Z0-9_-]+)(\?.*)?$/;
//   const match = url.match(regex);
//   return match ? match[1] : null;
// }

// // Helper: Download file from URL to local path
// async function downloadFile(url, dest) {
//   const writer = fs.createWriteStream(dest);
//   const response = await axios({
//     url,
//     method: "GET",
//     responseType: "stream",
//   });
//   response.data.pipe(writer);
//   return new Promise((resolve, reject) => {
//     writer.on("finish", resolve);
//     writer.on("error", reject);
//   });
// }

// // Helper: Check if folder is publicly accessible
// async function isFolderPubliclyAccessible(folderId, apiKey) {
//   try {
//     // Try fetching folder metadata to check permissions
//     const metadataUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=permissions&key=${apiKey}`;
//     const response = await axios.get(metadataUrl);

//     const permissions = response.data.permissions || [];

//     // Check for "anyoneWithLink" permission (viewer, reader, or writer)
//     if (permissions.length > 0) {
//       const isPublic = permissions.some(
//         (perm) =>
//           perm.type === "anyone" &&
//           (perm.role === "viewer" ||
//             perm.role === "reader" ||
//             perm.role === "writer")
//       );
//       if (isPublic) return true;
//     }

//     // Fallback: Try listing files to confirm public access
//     const testUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false&key=${apiKey}&fields=files(id)`;
//     await axios.get(testUrl);
//     console.log(
//       "%c [ Fallback Test Success ]",
//       "font-size:13px; background:green; color:#fff;"
//     );
//     return true; // If testUrl succeeds, assume folder is public
//   } catch (error) {
//     if (error.response && error.response.status === 403) {
//       return false; // Explicitly not public
//     }
//     return false; // Assume not public for other errors
//   }
// }

// router.post("/import-drive-folder", async (req, res) => {
//   try {
//     let { folderUrl, vendorId } = req.body;

//     // Validate request
//     if (!folderUrl || !vendorId) {
//       return res
//         .status(400)
//         .json({ message: "Folder URL and Vendor ID are required." });
//     }

//     const folderId = getFolderIdFromUrl(folderUrl);
//     if (!folderId) {
//       return res
//         .status(400)
//         .json({ message: "Invalid Google Drive folder URL" });
//     }

//     if (!apiKey) {
//       return res
//         .status(500)
//         .json({ message: "Google Drive API key not configured" });
//     }

//     // Check if the folder is publicly accessible
//     const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
//     if (!isPublic) {
//       return res
//         .status(400)
//         .json({
//           message: "Google Drive folder link is not publicly accessible.",
//         });
//     }

//     const order = await OrderModel.findOne({ order_id: vendorId - 10800 });
//     if (!order) {
//       return res.status(404).json({ message: "Order not found." });
//     }

//     const customerId = order.fromId;
//     const phoneNo = order.phone_no;
//     const folderName = `${vendorId}`;

//     let existingFolder = await FolderModel.findOne({
//       folderName,
//       customerId,
//     });

//     if (!existingFolder) {
//       const folder = new FolderModel({ folderName, customerId, vendorId });
//       await folder.save();
//       existingFolder = folder;
//     }

//     // Create temp directory
//     const tempDir = path.join(__dirname, "uploads");
//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }

//     // List all image files in the folder using Google Drive API
//     let files = [];
//     let pageToken = null;
//     do {
//       let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false%20and%20mimeType%20contains%20'image/'&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
//       if (pageToken) listUrl += `&pageToken=${pageToken}`;
//       const listRes = await axios.get(listUrl);
//       files = files.concat(listRes.data.files);
//       pageToken = listRes.data.nextPageToken;
//     } while (pageToken);

//     if (files.length === 0) {
//       return res.status(404).json({ message: "No images found in the folder" });
//     }

//     let folderPath = vendorId
//       ? `${folderName}_${customerId}`
//       : `${folderName}_${customerId}`;

//     // Process all files concurrently
//     const uploadPromises = files.map(async (file) => {
//       try {
//         const originalName = file.name;
//         const fileName = `${Date.now()}_${originalName}`; // Match /upload naming: ${Date.now()}_${originalName}
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(
//           tempDir,
//           `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
//         );

//         // Download from Google Drive
//         const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//         await downloadFile(downloadUrl, filePath);

//         console.log(
//           `Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`
//         );

//         // Generate Thumbnail
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image
//         const s3UploadPromise = uploadFileToS3(
//           filePath,
//           fileName,
//           folderPath,
//           phoneNo
//         );

//         await thumbnailPromise;

//         // Upload Thumbnail
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

//         // Cleanup local files (async with error handling)
//         try {
//           await fsp.unlink(filePath);
//         } catch (unlinkError) {
//           console.error(
//             `Error deleting local file ${filePath}:`,
//             unlinkError.message
//           );
//         }
//         try {
//           await fsp.unlink(thumbnailPath);
//         } catch (unlinkError) {
//           console.error(
//             `Error deleting local thumbnail ${thumbnailPath}:`,
//             unlinkError.message
//           );
//         }

//         return {
//           fileName: originalName,
//           fileUrl: s3Response.Location,
//           s3Key: s3Response.Key,
//           thumbnailUrl: s3ThumbResponse.Location,
//           thumbnailKey: s3ThumbResponse.Key,
//         };
//       } catch (error) {
//         console.error(`Error processing ${file.name}:`, error);
//         const fileName = `${Date.now()}_${file.name}`;
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(
//           tempDir,
//           `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
//         );
//         try {
//           if (fs.existsSync(filePath)) {
//             await fsp.unlink(filePath);
//           }
//           if (fs.existsSync(thumbnailPath)) {
//             await fsp.unlink(thumbnailPath);
//           }
//         } catch (unlinkError) {
//           console.error(
//             `Error deleting local files in error case:`,
//             unlinkError.message
//           );
//         }
//         return { fileName: file.name, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;

//     await OrderModel.updateOne(
//       { order_id: vendorId - 10800 },
//       { $set: { orderGalleryLink, orderDriveLink: folderUrl } }
//     );

//     res.status(201).json({
//       message: "Files uploaded successfully from Google Drive.",
//       files: uploadedFiles,
//       folderDetails: {
//         folderName,
//         customerId,
//         vendorId,
//         phoneNo,
//         order_date: order.order_date,
//       },
//     });
//   } catch (error) {
//     console.error("Drive Upload error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   } finally {
//     // Cleanup temp directory if empty
//     const tempDir = path.join(__dirname, "uploads");
//     try {
//       const files = await fsp.readdir(tempDir);
//       if (files.length === 0) {
//         await fsp.rmdir(tempDir);
//       }
//     } catch (error) {
//       console.error(
//         `Error cleaning up temp directory ${tempDir}:`,
//         error.message
//       );
//     }
//   }
// });

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

// =================== Helpers ===================

// Extract folder ID from Google Drive URL
function getFolderIdFromUrl(url) {
  const regex = /\/folders\/([a-zA-Z0-9_-]+)(\?.*)?$/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Download file from Google Drive
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

// Check if Google Drive folder is public
async function isFolderPubliclyAccessible(folderId, apiKey) {
  try {
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=permissions&key=${apiKey}`;
    const response = await axios.get(metadataUrl);
    const permissions = response.data.permissions || [];

    if (
      permissions.some(
        (perm) =>
          perm.type === "anyone" &&
          (perm.role === "viewer" ||
            perm.role === "reader" ||
            perm.role === "writer")
      )
    ) {
      return true;
    }

    // Fallback test
    const testUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&key=${apiKey}&fields=files(id)`;
    await axios.get(testUrl);
    return true;
  } catch (error) {
    return false;
  }
}

// =================== Main Upload Logic ===================
async function handleDriveFolderUpload(folderUrl, vendorId) {
  const folderId = getFolderIdFromUrl(folderUrl);
  if (!folderId) throw new Error("Invalid Google Drive folder URL");
  if (!apiKey) throw new Error("Google Drive API key not configured");

  // check access
  const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
  if (!isPublic)
    throw new Error("Google Drive folder link is not publicly accessible");

  const order = await OrderModel.findOne({ order_id: vendorId - 10800 });
  if (!order) throw new Error("Order not found");

  const customerId = order.fromId;
  const phoneNo = order.phone_no;
  const folderName = `${vendorId}`;

  let existingFolder = await FolderModel.findOne({ folderName, customerId });
  if (!existingFolder) {
    const folder = new FolderModel({ folderName, customerId, vendorId });
    await folder.save();
    existingFolder = folder;
  }

  // temp dir
  const tempDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // list files
  let files = [];
  let pageToken = null;
  do {
    let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false and mimeType contains 'image/'&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
    if (pageToken) listUrl += `&pageToken=${pageToken}`;
    const listRes = await axios.get(listUrl);
    files = files.concat(listRes.data.files);
    pageToken = listRes.data.nextPageToken;
  } while (pageToken);

  if (files.length === 0) throw new Error("No images found in the folder");

  const folderPath = `${folderName}_${customerId}`;

  // process files
  const uploadPromises = files.map(async (file) => {
    try {
      const originalName = file.name;
      const fileName = `${Date.now()}_${originalName}`;
      const filePath = path.join(tempDir, fileName);
      const thumbnailPath = path.join(
        tempDir,
        `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
      );

      const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
      await downloadFile(downloadUrl, filePath);

      console.log(`Processing file: ${fileName}`);

      const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);
      const s3UploadPromise = uploadFileToS3(
        filePath,
        fileName,
        folderPath,
        phoneNo
      );

      await thumbnailPromise;

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

      const [s3Response, s3ThumbResponse] = await Promise.all([
        s3UploadPromise,
        s3ThumbPromise,
      ]);

      // cleanup
      try {
        await fsp.unlink(filePath);
      } catch {}
      try {
        await fsp.unlink(thumbnailPath);
      } catch {}

      return {
        fileName: originalName,
        fileUrl: s3Response.Location,
        thumbnailUrl: s3ThumbResponse.Location,
      };
    } catch (err) {
      console.error(`Error processing ${file.name}:`, err);
      return { fileName: file.name, error: err.message };
    }
  });

  const uploadedFiles = await Promise.all(uploadPromises);

  const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;
  await OrderModel.updateOne(
    { order_id: vendorId - 10800 },
    { $set: { orderGalleryLink, orderDriveLink: folderUrl } }
  );

  console.log("✅ Upload completed for vendorId:", vendorId);
  return uploadedFiles;
}

// =================== Route ===================
router.post("/import-drive-folder", async (req, res) => {
  try {
    const { folderUrl, vendorId } = req.body;

    if (!folderUrl || !vendorId) {
      return res
        .status(400)
        .json({ message: "Folder URL and Vendor ID are required." });
    }

    // 🚀 Turant response bhej do
    res.status(202).json({
      message: "Upload started, processing in background.",
      vendorId,
    });

    // 🚀 Background processing
    process.nextTick(async () => {
      try {
        await handleDriveFolderUpload(folderUrl, vendorId);
      } catch (err) {
        console.error("❌ Background upload failed:", err);
      }
    });
  } catch (error) {
    console.error("Drive Upload error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
});

router.post("/add-order-drive-link", async (req, res) => {
  try {
    const { folderUrl, order_id } = req.body;
    if (!folderUrl || !order_id) {
      return res
        .status(400)
        .json({ message: "Folder URL and order_id are required." });
    }

    const folderId = getFolderIdFromUrl(folderUrl);
    if (!folderId) throw new Error("Invalid Google Drive folder URL");
    if (!apiKey) throw new Error("Google Drive API key not configured");

    // check access
    const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
    if (!isPublic)
      throw new Error("Google Drive folder link is not publicly accessible");

    // find order
    const order = await OrderModel.findOne({ order_id: order_id });
    if (!order) throw new Error(`Order not found for order_id : ${order_id}`);

    // update order
    let result = await OrderModel.updateOne(
      { order_id: order_id },
      { $set: { orderDriveLink: folderUrl } }
    );

    if (result.modifiedCount > 0) {
      res.status(201).json({
        message: `Drive link successfully added for Order_id: ${order_id}`,
      });
    } else {
      throw new Error("Order update failed");
    }
  } catch (error) {
    console.error("Error on adding google drive link to :", error.message);
    res
      .status(500)
      .json({ error: error.message});
  }
});

router.post("/update-google-sheet", async (req, res) => {
  try {
    let updatedPhoneNumber = req.body.phone;
    if (!updatedPhoneNumber.startsWith("+91")) {
      updatedPhoneNumber = `+91${updatedPhoneNumber}`;
    }
    let payload = {
      ...req.body,
      phone: updatedPhoneNumber,
    };
    const googleResp = await axios.post(
      "https://script.google.com/macros/s/AKfycbygkJKWyvk4xBpU0CZwoyCBL05v_W7kzwHb-wGOvWvzaoEVhulMfQRLatrT4FG1HPzl/exec",
      payload,
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
