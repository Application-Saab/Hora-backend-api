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
   console.log(`handleDriveFolderUpload START for ${vendorId}`, { folderUrl, vendorId });
  const folderId = getFolderIdFromUrl(folderUrl);
  console.log(`Extracted folderId: ${vendorId}`, folderId);
  if (!folderId) throw new Error("Invalid Google Drive folder URL");
  console.log(`Checking Google Drive API key ${vendorId}`);
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
  console.log(`FolderName: ${vendorId}`, folderName);

  let existingFolder = await FolderModel.findOne({ folderName, customerId });
   console.log(`Existing folder found: ${vendorId}`, !!existingFolder);
  if (!existingFolder) {
    console.log("Creating new folder record for Id:", vendorId);
    const folder = new FolderModel({ folderName, customerId, vendorId });
    await folder.save();
    existingFolder = folder;
  }

  // temp dir
  const tempDir = path.join(__dirname, "uploads");
  console.log(`Temp dir: ${vendorId}`, tempDir);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log("Temp dir created");
  }

  // list files
  let files = [];
  let pageToken = null;
  console.log(`Fetching images from Google Drive ${vendorId}`);
  do {
    let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false and mimeType contains 'image/'&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
    if (pageToken) listUrl += `&pageToken=${pageToken}`;
    const listRes = await axios.get(listUrl);
    console.log(`Files fetched:${vendorId}`, listRes.data.files.length);
    files = files.concat(listRes.data.files);
    pageToken = listRes.data.nextPageToken;
  } while (pageToken);
console.log(`Total images found: ${vendorId}`, files.length);
  if (files.length === 0) throw new Error("No images found in the folder");

  const folderPath = `${folderName}_${customerId}`;

  // process files
  const uploadPromises = files.map(async (file, index) => {
    console.log(`id - ${vendorId} [${index + 1}/${files.length}] Start processing`, file.name);
  let filePath;
  let thumbnailPath;

  try {
    const originalName = file.name;
    const fileName = `${Date.now()}_${originalName}`;

    filePath = path.join(tempDir, fileName);
    thumbnailPath = path.join(
      tempDir,
      `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
    );

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

     console.log(`Downloading from Drive: ${vendorId}`, downloadUrl);

    // DOWNLOAD
    await downloadFile(downloadUrl, filePath);

    console.log(`Processing file: ${fileName}`);

    // UPLOAD ORIGINAL
    const s3UploadPromise = uploadFileToS3(
      filePath,
      fileName,
      folderPath,
      phoneNo
    );

    // THUMBNAIL
    await generateThumbnail(filePath, thumbnailPath);

    const thumbFileName = `thumb_${fileName.replace(
      /\.(png|jpeg|jpg)$/i,
      ""
    )}.webp`;

    const s3ThumbPromise = uploadFileToS3(
      thumbnailPath,
      thumbFileName,
      folderPath,
      phoneNo
    );

    const [s3Response, s3ThumbResponse] = await Promise.all([
      s3UploadPromise,
      s3ThumbPromise,
    ]);

    return {
      fileName: originalName,
      fileUrl: s3Response.Location,
      thumbnailUrl: s3ThumbResponse.Location,
    };
  } catch (err) {
     console.error(`❌ Error processing id - ${vendorId}, ${file?.name}`, {
      message: err.message,
    });
    return { fileName: file?.name, error: err.message };
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        console.log(`filepath unlink error id - ${vendorId}, `,err.message);
      }
    }
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        await fsp.unlink(thumbnailPath);
      } catch (err) {
        console.log(`thumbnail unlink error id - ${vendorId}, `,err.message);
      }
    }
  }
});


  const uploadedFiles = await Promise.all(uploadPromises);
 console.log(" All uploads completed");
 const successCount = uploadedFiles.filter(f => !f.error).length;
const errorCount = uploadedFiles.filter(f => f.error).length;

console.log(`Upload summary for ${vendorId}`, {
  total: uploadedFiles.length,
  success: successCount,
  failed: errorCount
});
  const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;
  console.log("Updating order with gallery link");
  await OrderModel.updateOne(
    { order_id: vendorId - 10800 },
    { $set: { orderGalleryLink, orderDriveLink: folderUrl } }
  );

  console.log("Upload completed for vendorId:", vendorId);
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

    // Turant response bhej do
    res.status(202).json({
      message: "Upload started, processing in background.",
      vendorId,
    });

    // Background processing
    process.nextTick(async () => {
      console.log(`⚙️ Background upload START for vendorId: ${vendorId}`);
      try {
        await handleDriveFolderUpload(folderUrl, vendorId);
        console.log(`✅ Background upload SUCCESS for vendorId: ${vendorId}`);
      } catch (err) {
        console.error(`❌ Background upload FAILED for vendorId: ${vendorId}`, {
      message: err.message
    });
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
      return res.status(400).json({
        message: "Folder URL and order_id are required",
      });
    }

    const folderId = getFolderIdFromUrl(folderUrl);
    if (!folderId) throw new Error("Invalid Google Drive folder URL");
    if (!apiKey) throw new Error("Google Drive API key not configured");

    // Order check
    const order = await OrderModel.findOne({ order_id });
    if (!order) throw new Error("Order not found");

    // Drive public check
    const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
    if (!isPublic)
      throw new Error("Google Drive folder is not publicly accessible");

    // WebLink generate
    const folderName = order_id + 10800;
    const customerId = order.fromId;

    const webLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;

    // MongoDB update (IMMEDIATE)
    await OrderModel.updateOne(
      { order_id },
      {
        $set: {
          orderDriveLink: folderUrl,
          orderWebLink: webLink,
        },
      }
    );

    // Frontend ko turant response
    res.status(201).json({
      message: "Drive link added successfully",
      webLink,
    });

    // Background me images upload
    process.nextTick(async () => {
      console.log(`Background upload started `);
      try {
        await handleDriveFolderUpload(folderUrl, folderName);
        console.log(`Background upload finished`);
      } catch (err) {
        console.error(`Background upload failed`, err.message);
      }
    });

  } catch (error) {
    console.error("add-order-drive-link error:", error.message);
    res.status(500).json({ error: error.message });
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
