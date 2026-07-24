const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const OrderModel = require("../models/order");
const FolderModel = require("../models/folder");
const userModel = require("../models/user")
const {
  generateThumbnail,
  uploadFileToS3,
} = require("../store/multerS3Config");
const fsp = require("fs").promises;
const EventinvitesModel = require("../models/event-invite")

const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
const deploymentId = process.env.GOOGLE_SCRIPT_DEPLOYMENT_ID;

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
    console.error(`Error processing ${file?.name}:`, err.message);
    return { fileName: file?.name, error: err.message };
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        await fs.unlinkSync(filePath);
      } catch {}
    }
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        await fs.unlinkSync(thumbnailPath);
      } catch {}
    }
  }
});


  const uploadedFiles = await Promise.all(uploadPromises);

  const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;
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
      return res.status(400).json({
        message: "Folder URL, Vendor ID are required.",
      });
    }

    const folderId = getFolderIdFromUrl(folderUrl);
    if (!folderId) throw new Error("Invalid Google Drive folder URL");

    if (!apiKey) throw new Error("Google Drive API key not configured");

    const order_id = vendorId-10800;

    // Order check
    const order = await OrderModel.findOne({ order_id });
    if (!order) throw new Error("Order not found");

    // Drive public check
    const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
    if (!isPublic)
      throw new Error("Google Drive folder is not publicly accessible");

    const customerId = order.fromId;
    const phoneNo = order.phone_no;
    const folderName = `${order_id}_${customerId}_${phoneNo}`;
    const fulfillmentDate = order?.order_date;

    let folder = await FolderModel.findOne({ folderName, customerId });

    if (!folder) {
      folder = new FolderModel({
        folderName,
        customerId,
        orderId: vendorId,
      });
      await folder.save();
    }

    const mainFolderId = folder._id;

    const webLink = `https://horaservices.com/weblink-gallery?folderName=${folderName}&customerId=${customerId}`;

    // MongoDB update
    await OrderModel.updateOne(
      { order_id },
      {
        $set: {
          orderDriveLink: folderUrl,
          orderWebLink: webLink,
       "imageUploadCounts.driveProvidedAt": new Date(),
        },
      }
    );

    res.status(201).json({
      message: "Drive link added successfully",
      webLink,
      phoneNo:phoneNo,
      fulfillmentDate:fulfillmentDate,
      folderName:folderName,
      customerId:customerId,
    });

    axios
      .post(`${process.env.MEDIA_WORKER_URL}/process-drive`, {
        folderUrl,
        order_id,
        customerId,
        phoneNo,
        mainFolderId,
      })
      .catch((err) => {
        console.error(
          "Media worker API call failed:",
          err.response?.data || err.message
        );
      });

  } catch (error) {
    console.error("Drive Upload error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.post("/add-order-drive-link", async (req, res) => {
  try {
    const { folderUrl, order_id, allDriveLinks = [], isRetry = false } = req.body;
    const order = await OrderModel.findOne({ order_id });
    if (!order) throw new Error("Order not found");
    const customerId = order.fromId;
    const orderId = order_id;
    const phoneNo = order.phone_no;

    const eventInvite = await EventinvitesModel.findOne({ orderId: Number(order_id) });
    const eventId = eventInvite ? eventInvite._id : null;

    const isRawLinkNewOrChanged = !order.orderDriveLink || order.orderDriveLink !== folderUrl;

    if (folderUrl?.trim()) {
      const folderId = getFolderIdFromUrl(folderUrl);

      if (!folderId) {
        return res.status(400).json({
          message: "Invalid Google Drive folder URL",
        });
      }

      const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);

      if (!isPublic) {
        return res.status(400).json({
          message:
            "The Google Drive folder is not publicly accessible. Please change its permission to 'Anyone with the link'.",
        });
      }
    }

    if (allDriveLinks.length > 0) {
      for (const item of allDriveLinks) {
        if (!item.link) {
          return res.status(400).json({
            message: `Link is missing for type: ${item.linkType || 'unknown'}`
          });
        }

        const folderId = getFolderIdFromUrl(item.link);
        if (!folderId) {
          return res.status(400).json({
            message: `Invalid Google Drive folder URL: ${item.link}`
          });
        }

        const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
        if (!isPublic) {
          return res.status(400).json({
            message: `The Google Drive folder for '${item.linkType}' is not publicly accessible. Please change its permission to 'Anyone with the link'.`,
          });
        }
      }
    }

    const folderName = `${order_id}_${customerId}_${phoneNo}`;

    let folder = await FolderModel.findOne({ folderName, customerId });

    if (!folder) {
      folder = new FolderModel({ folderName, customerId, orderId, eventId });
      await folder.save();
    }
    let webLink = order.orderWebLink;
    let updateFields = {};

    let isAnySubLinkChangedOrNew = false; 

    if (allDriveLinks.length > 0) {
      const existingLinks = order.allDriveLinks || [];

      updateFields.allDriveLinks = allDriveLinks.map(item => {
        const existingItem = existingLinks.find(el => el.linkType === item.linkType);

        if (!existingItem || existingItem.link !== item.link) {
          isAnySubLinkChangedOrNew = true;
          return { ...item, submittedAt: new Date() };
        }

        return { ...item, submittedAt: existingItem.submittedAt || new Date() };
      });
    }

    if (folderUrl && folderUrl.trim() !== "") {

      let mainFolderId = folder._id;
      webLink = `https://horaservices.com/weblink-gallery?folderName=${folderName}&customerId=${customerId}`;

      updateFields.orderDriveLink = folderUrl;
      updateFields.orderWebLink = webLink;
      updateFields["imageUploadCounts.driveProvidedAt"] = new Date();
      if (isRawLinkNewOrChanged || isRetry === true) {
      axios
        .post(`${process.env.MEDIA_WORKER_URL}/process-drive`, {
          folderUrl,
          order_id,
          customerId,
          phoneNo,
          mainFolderId,
        })
        .catch((err) => {
          console.error(
            "Media worker API call failed for rawPhotos:",
            err.response?.data || err.message
          );
        });
      }
      else {
        console.log("-> Skipping media worker. Link is identical and it's not a retry request.");
      }

      if (isRawLinkNewOrChanged || isAnySubLinkChangedOrNew || isRetry === true) {
        console.log("-> Changes or Retry detected. Updating Google Sheet...");

        let contentTypesPayload = [];
        if (updateFields.allDriveLinks && updateFields.allDriveLinks.length > 0) {
          contentTypesPayload = updateFields.allDriveLinks.map(item => {
            const dateObj = new Date(item.submittedAt);

            const formattedDate = dateObj.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
            const formattedTime = dateObj.toLocaleTimeString("en-GB", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            });

            return {
              linkType: item.linkType || "Raw Photos",
              link: item.link || "",
              submittedAt: `${formattedDate}, ${formattedTime}`, 
            };
          });
        } else {
          const dateObj = new Date();
          const formattedDate = dateObj.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
          const formattedTime = dateObj.toLocaleTimeString("en-GB", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });

          contentTypesPayload.push({
            linkType: "Raw Photos",
            link: folderUrl,
            submittedAt: `${formattedDate}, ${formattedTime}`,
          });
        }

      const googlePayload = {
        targetSheet: "photography_drivelink",
        orderId: String(Number(order_id) + 10800), 
        orderFulfilmentDate: order?.order_date
          ? new Date(order.order_date).toLocaleDateString("en-GB")
          : "N/A",
        contentTypes: contentTypesPayload 
      };

      axios
        .post(
          `https://script.google.com/macros/s/${deploymentId}/exec`,
          googlePayload,
          { headers: { "Content-Type": "application/json" } }
        )
        .catch((err) => {
          console.error(
            "Google Sheet update failed:",
            err.response?.data || err.message
          );
        });
      }
      }

    await OrderModel.updateOne({ order_id }, { $set: updateFields });

    res.status(201).json({
      message: "Drive link added successfully",
      webLink,
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
