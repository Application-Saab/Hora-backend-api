const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");
const DriveImportedImages = require("../models/driveImportedImages"); // Adjust path if needed
const OrderModel = require("../models/order"); // Adjust path if needed
const FolderModel = require("../models/folder"); // Adjust path if needed
const { generateThumbnail, uploadFileToS3 } = require("../store/multerS3Config"); // From your existing code
const fsp = require("fs").promises;

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
// router.post("/import-drive-folder", async (req, res) => {
//   const { userId, folderUrl } = req.body;

//   // Validation
//   if (!mongoose.Types.ObjectId.isValid(userId)) {
//     return res.status(400).json({ error: true, message: "Invalid user ID" });
//   }
//   if (!folderUrl) {
//     return res
//       .status(400)
//       .json({ error: true, message: "Folder URL is required" });
//   }

//   const folderId = getFolderIdFromUrl(folderUrl);
//   if (!folderId) {
//     return res
//       .status(400)
//       .json({ error: true, message: "Invalid Google Drive folder URL" });
//   }


//   if (!apiKey) {
//     return res
//       .status(500)
//       .json({ error: true, message: "Google Drive API key not configured" });
//   }

//   try {
//     // List all image files in the folder using Google Drive API
//     let files = [];
//     let pageToken = null;
//     do {
//       let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
//       if (pageToken) listUrl += `&pageToken=${pageToken}`;
//       const listRes = await axios.get(listUrl);
//       files = files.concat(
//         listRes.data.files.filter((f) => f.mimeType.startsWith("image/"))
//       );
//       pageToken = listRes.data.nextPageToken;
//     } while (pageToken);

//     if (files.length === 0) {
//       return res
//         .status(404)
//         .json({ error: true, message: "No images found in the folder" });
//     }

//     // Process each image: Download, generate thumbnail, upload to S3
//     const importedImages = [];
//     const tempDir = "./uploads/";
//     if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

//     for (const file of files) {
//       const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//       const filePath = path.join(tempDir, file.name);
//       await downloadFile(downloadUrl, filePath);

//       // Generate thumbnail
//       const thumbnailPath = path.join(
//         tempDir,
//         `thumb_${path.basename(file.name, path.extname(file.name))}.webp`
//       );
//       await generateThumbnail(filePath, thumbnailPath);

//       // Upload original and thumbnail to S3
//       const mimeType = file.mimeType;
//       const originalName = file.name;
//       const fileName = `${Date.now()}-${originalName}`;
//       const thumbnailFileName = `thumb_${fileName.replace(
//         /\.[^/.]+$/,
//         ""
//       )}.webp`;

//       const [uploadResult, thumbnailUploadResult] = await Promise.all([
//         uploadImageToS3(filePath, fileName, userId, mimeType),
//         uploadImageToS3(thumbnailPath, thumbnailFileName, userId, "image/webp"),
//       ]);

//       importedImages.push({
//         originalName,
//         url: uploadResult.Location,
//         key: uploadResult.Key,
//         thumbnailUrl: thumbnailUploadResult.Location,
//         thumbnailKey: thumbnailUploadResult.Key,
//       });

//       // Cleanup temp files
//       fs.unlinkSync(filePath);
//       fs.unlinkSync(thumbnailPath);
//     }

//     // Store in MongoDB (append to existing document if user already has one)
//     let doc = await DriveImportedImages.findOne({ userId });
//     if (!doc) {
//       doc = new DriveImportedImages({ userId, images: [] });
//     }
//     doc.images.push(...importedImages);
//     await doc.save();

//     return res
//       .status(200)
//       .json({
//         error: false,
//         message: "Images imported and stored successfully",
//         data: doc,
//       });
//   } catch (err) {
//     console.error("Import Error:", err);
//     return res.status(500).json({ error: true, message: "Server error" });
//   }
// });

// POST /drive-upload: Import and upload images from Google Drive folder to S3
// router.post("/import-drive-folder", async (req, res) => {
//   try {
//     const { folderName, customerId, vendorId, phoneNo, folderUrl } = req.body;

//     // Validate request
//     if (!folderName || !customerId || !folderUrl) {
//       return res.status(400).json({ message: "Folder Name, Customer ID, and Folder URL are required." });
//     }

//     const folderId = getFolderIdFromUrl(folderUrl);
//     if (!folderId) {
//       return res.status(400).json({ message: "Invalid Google Drive folder URL" });
//     }

//     if (!apiKey) {
//       return res.status(500).json({ message: "Google Drive API key not configured" });
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

//     // Define S3 folder path (same as /upload route)
//     let folderPath = vendorId ? `${folderName}_${customerId}_${vendorId}` : `${folderName}_${customerId}`;

//     // Temp directory for downloads
//     const tempDir = "./Uploads/";
//     if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

//     // Process all files concurrently
//     const uploadPromises = files.map(async (file) => {
//       try {
//         const originalName = file.name;
//         const fileName = `${Date.now()}-${originalName}`; // Same naming convention as /upload
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);

//         // Download from Google Drive
//         const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//         await downloadFile(downloadUrl, filePath);

//         console.log(`Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`);

//         // Generate Thumbnail (Parallel)
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image (Parallel)
//         const s3UploadPromise = uploadFileToS3(filePath, fileName, folderPath, phoneNo);

//         await thumbnailPromise; // Ensure thumbnail is generated before uploading

//         // Upload Thumbnail (Parallel)
//         const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`;
//         const s3ThumbPromise = uploadFileToS3(thumbnailPath, thumbnailFileName, folderPath, phoneNo);

//         // Wait for both uploads to complete
//         const [s3Response, s3ThumbResponse] = await Promise.all([
//           s3UploadPromise,
//           s3ThumbPromise,
//         ]);

//         // Cleanup local files
//         fs.unlinkSync(filePath);
//         fs.unlinkSync(thumbnailPath);

//         return {
//           fileName: originalName,
//           fileUrl: s3Response.Location,
//           s3Key: s3Response.Key,
//           thumbnailUrl: s3ThumbResponse.Location,
//           thumbnailKey: s3ThumbResponse.Key,
//         };
//       } catch (error) {
//         console.error(`Error processing ${file.name}:`, error);
//         return { fileName: file.name, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     res.status(201).json({
//       message: "Files uploaded successfully from Google Drive.",
//       files: uploadedFiles,
//     });
//   } catch (error) {
//     console.error("Drive Upload error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });




// POST /import-drive-folder: Import and upload images from Google Drive folder to S3
// router.post("/import-drive-folder", async (req, res) => {
//   try {
//     const { folderName, customerId, vendorId, phoneNo, folderUrl } = req.body;

//     // Validate request
//     if (!folderName || !customerId || !folderUrl) {
//       return res.status(400).json({ message: "Folder Name, Customer ID, and Folder URL are required." });
//     }

//     const folderId = getFolderIdFromUrl(folderUrl);
//     if (!folderId) {
//       return res.status(400).json({ message: "Invalid Google Drive folder URL" });
//     }

//     if (!apiKey) {
//       return res.status(500).json({ message: "Google Drive API key not configured" });
//     }

//     // Create temp directory (mimicking multer's diskStorage)
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

//     // Define S3 folder path (same as /upload route)
//     let folderPath = vendorId ? `${folderName}_${customerId}_${vendorId}` : `${folderName}_${customerId}`;

//     // Process all files concurrently
//     const uploadPromises = files.map(async (file) => {
//       try {
//         const originalName = file.name;
//         const fileName = `${Date.now()}_${originalName}`; // Match /upload naming: ${Date.now()}_${originalName}
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);

//         // Download from Google Drive
//         const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//         await downloadFile(downloadUrl, filePath);

//         console.log(`Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`);

//         // Generate Thumbnail (Parallel)
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image (Parallel)
//         const s3UploadPromise = uploadFileToS3(filePath, fileName, folderPath, phoneNo);

//         await thumbnailPromise; // Ensure thumbnail is generated before uploading

//         // Upload Thumbnail (Parallel)
//         const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`;
//         const s3ThumbPromise = uploadFileToS3(thumbnailPath, thumbnailFileName, folderPath, phoneNo);

//         // Wait for both uploads to complete
//         const [s3Response, s3ThumbResponse] = await Promise.all([
//           s3UploadPromise,
//           s3ThumbPromise,
//         ]);

//         // Cleanup local files (async with error handling)
//         try {
//           await fsp.unlink(filePath);
//           console.log(`Deleted local file: ${filePath}`);
//         } catch (unlinkError) {
//           console.error(`Error deleting local file ${filePath}:`, unlinkError.message);
//         }
//         try {
//           await fsp.unlink(thumbnailPath);
//           console.log(`Deleted local thumbnail: ${thumbnailPath}`);
//         } catch (unlinkError) {
//           console.error(`Error deleting local thumbnail ${thumbnailPath}:`, unlinkError.message);
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
//         // Cleanup local files in case of error
//         const fileName = `${Date.now()}_${file.name}`;
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);
//         try {
//           if (fs.existsSync(filePath)) {
//             await fsp.unlink(filePath);
//             console.log(`Deleted local file (error case): ${filePath}`);
//           }
//           if (fs.existsSync(thumbnailPath)) {
//             await fsp.unlink(thumbnailPath);
//             console.log(`Deleted local thumbnail (error case): ${thumbnailPath}`);
//           }
//         } catch (unlinkError) {
//           console.error(`Error deleting local files in error case:`, unlinkError.message);
//         }
//         return { fileName: file.name, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     res.status(201).json({
//       message: "Files uploaded successfully from Google Drive.",
//       files: uploadedFiles,
//     });
//   } catch (error) {
//     console.error("Drive Upload error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   } finally {
//     // Cleanup temp directory if empty
//     const tempDir = path.join(__dirname, "Uploads");
//     try {
//       const files = await fsp.readdir(tempDir);
//       if (files.length === 0) {
//         await fsp.rmdir(tempDir);
//         console.log(`Deleted empty temp directory: ${tempDir}`);
//       }
//     } catch (error) {
//       console.error(`Error cleaning up temp directory ${tempDir}:`, error.message);
//     }
//   }
// });








// {
//     "message": "Files uploaded successfully from Google Drive.",
//     "files": [
//         {
//             "fileName": "contactus.png",
//             "fileUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/1757006809696_contactus.png",
//             "s3Key": "10818_68849ffc1651b3b2e77f00c3_10818/1757006809696_contactus.png",
//             "thumbnailUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809696_contactus.webp",
//             "thumbnailKey": "10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809696_contactus.webp"
//         },
//         {
//             "fileName": "ConfirmOrderUnselected.png",
//             "fileUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/1757006809702_ConfirmOrderUnselected.png",
//             "s3Key": "10818_68849ffc1651b3b2e77f00c3_10818/1757006809702_ConfirmOrderUnselected.png",
//             "thumbnailUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809702_ConfirmOrderUnselected.webp",
//             "thumbnailKey": "10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809702_ConfirmOrderUnselected.webp"
//         },
//         {
//             "fileName": "contactusbanner.png",
//             "fileUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/1757006809705_contactusbanner.png",
//             "s3Key": "10818_68849ffc1651b3b2e77f00c3_10818/1757006809705_contactusbanner.png",
//             "thumbnailUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809705_contactusbanner.webp",
//             "thumbnailKey": "10818_68849ffc1651b3b2e77f00c3_10818/thumb_1757006809705_contactusbanner.webp"
//         }
//     ]
// }

// {
//     "message": "Files uploaded successfully.",
//     "files": [
//         {
//             "fileName": "lucky-draw-1755794557777.jpg",
//             "fileUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/testing_1_68849ffc1651b3b2e77f00c3/1757007095605_lucky-draw-1755794557777.jpg",
//             "s3Key": "testing_1_68849ffc1651b3b2e77f00c3/1757007095605_lucky-draw-1755794557777.jpg",
//             "thumbnailUrl": "https://photography-hora.s3.eu-north-1.amazonaws.com/testing_1_68849ffc1651b3b2e77f00c3/thumb_1757007095605_lucky-draw-1755794557777.webp",
//             "thumbnailKey": "testing_1_68849ffc1651b3b2e77f00c3/thumb_1757007095605_lucky-draw-1755794557777.webp"
//         }
//     ]
// }




// router.post("/import-drive-folder", async (req, res) => {
//   try {
//     let { folderUrl, vendorId } = req.body;
//     // vendorId = vendorId - 10800; // Adjust vendorId as per old logic

//     // Validate request
//     if (!folderUrl || !vendorId) {
//       return res.status(400).json({ message: "Folder URL and Vendor ID are required." });
//     }

//     const folderId = getFolderIdFromUrl(folderUrl);
//     if (!folderId) {
//       return res.status(400).json({ message: "Invalid Google Drive folder URL" });
//     }

//     if (!apiKey) {
//       return res.status(500).json({ message: "Google Drive API key not configured" });
//     }

//     // Find the order by vendorId (assuming vendorId is the order_id, stored as _id in orders collection)
//     const order = await OrderModel.findOne({order_id : vendorId - 10800});
//     if (!order) {
//       return res.status(404).json({ message: "Order not found." });
//     }

//     const customerId = order.fromId;
//     const phoneNo = order.phone_no;

//     // Generate folderName from order details (e.g., "Photos_Wed_Sep_04_2024")
//     const folderName = `${vendorId}`;

//     // Check if a folder with the same name already exists for the same customer
//     const existingFolder = await FolderModel.findOne({
//       folderName,
//       customerId,
//     });
//     if (existingFolder) {
//       return res.status(400).json({
//         message: `Folder with the name '${folderName}' already exists for this customer.`,
//       });
//     }

//     // Create and save the folder
//     const folder = new FolderModel({ folderName, customerId, vendorId });
//     await folder.save();

//     // Create temp directory (mimicking multer's diskStorage)
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

//     // Define S3 folder path (same as /upload route)
//     let folderPath = vendorId ? `${folderName}_${customerId}` : `${folderName}_${customerId}`;

//     // Process all files concurrently
//     const uploadPromises = files.map(async (file) => {
//       try {
//         const originalName = file.name;
//         const fileName = `${Date.now()}_${originalName}`; // Match /upload naming: ${Date.now()}_${originalName}
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);

//         // Download from Google Drive
//         const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//         await downloadFile(downloadUrl, filePath);

//         console.log(`Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`);

//         // Generate Thumbnail (Parallel)
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image (Parallel)
//         const s3UploadPromise = uploadFileToS3(filePath, fileName, folderPath, phoneNo);

//         await thumbnailPromise; // Ensure thumbnail is generated before uploading

//         // Upload Thumbnail (Parallel)
//         const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`;
//         const s3ThumbPromise = uploadFileToS3(thumbnailPath, thumbnailFileName, folderPath, phoneNo);

//         // Wait for both uploads to complete
//         const [s3Response, s3ThumbResponse] = await Promise.all([
//           s3UploadPromise,
//           s3ThumbPromise,
//         ]);

//         // Cleanup local files (async with error handling)
//         try {
//           await fsp.unlink(filePath);
//           console.log(`Deleted local file: ${filePath}`);
//         } catch (unlinkError) {
//           console.error(`Error deleting local file ${filePath}:`, unlinkError.message);
//         }
//         try {
//           await fsp.unlink(thumbnailPath);
//           console.log(`Deleted local thumbnail: ${thumbnailPath}`);
//         } catch (unlinkError) {
//           console.error(`Error deleting local thumbnail ${thumbnailPath}:`, unlinkError.message);
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
//         // Cleanup local files in case of error
//         const fileName = `${Date.now()}_${file.name}`;
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);
//         try {
//           if (fs.existsSync(filePath)) {
//             await fsp.unlink(filePath);
//             console.log(`Deleted local file (error case): ${filePath}`);
//           }
//           if (fs.existsSync(thumbnailPath)) {
//             await fsp.unlink(thumbnailPath);
//             console.log(`Deleted local thumbnail (error case): ${thumbnailPath}`);
//           }
//         } catch (unlinkError) {
//           console.error(`Error deleting local files in error case:`, unlinkError.message);
//         }
//         return { fileName: file.name, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;
//     const orderDriveLink = folderUrl;

//     await OrderModel.updateOne({ order_id: vendorId - 10800 }, { $set: { orderGalleryLink, orderDriveLink } });

//     res.status(201).json({
//       message: "Files uploaded successfully from Google Drive.",
//       files: uploadedFiles,
//       folderDetails : { folderName, customerId, vendorId, phoneNo }
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
//         console.log(`Deleted empty temp directory: ${tempDir}`);
//       }
//     } catch (error) {
//       console.error(`Error cleaning up temp directory ${tempDir}:`, error.message);
//     }
//   }
// });


// async function isFolderPubliclyAccessible(folderId, apiKey) {
//   try {
//     const metadataUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=permissions&key=${apiKey}`;
//     const response = await axios.get(metadataUrl);
//     console.log('%c [ Folder Metadata ]', 'font-size:13px; background:yellow; color:#000;', response);
    
//     const permissions = response.data.permissions || [];
//     console.log('%c [ permissions ]-653', 'font-size:13px; background:pink; color:#bf2c9f;', permissions)
//     // Check for "anyoneWithLink" permission
//     const isPublic = permissions.some(
//       (perm) => perm.type === "anyone"
//     );
//     return isPublic;
//   } catch (error) {
//     console.error('%c [ Folder Metadata Error ]', 'font-size:13px; background:red; color:#fff;', error.response?.data || error.message);
//     return false; // Assume not public if metadata fetch fails
//   }
// }





// Helper: Check if folder is publicly accessible
async function isFolderPubliclyAccessible(folderId, apiKey) {
  try {
    // Try fetching folder metadata to check permissions
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=permissions&key=${apiKey}`;
    const response = await axios.get(metadataUrl);
    console.log('%c [ Folder Metadata ]', 'font-size:13px; background:yellow; color:#000;', response.data);
    
    const permissions = response.data.permissions || [];
    console.log('%c [ permissions ]-653', 'font-size:13px; background:pink; color:#bf2c9f;', permissions);
    
    // Check for "anyoneWithLink" permission (viewer, reader, or writer)
    if (permissions.length > 0) {
      const isPublic = permissions.some(
        (perm) => perm.type === "anyone" && (perm.role === "viewer" || perm.role === "reader" || perm.role === "writer")
      );
      if (isPublic) return true;
    }

    // Fallback: Try listing files to confirm public access
    const testUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false&key=${apiKey}&fields=files(id)`;
    await axios.get(testUrl);
    console.log('%c [ Fallback Test Success ]', 'font-size:13px; background:green; color:#fff;');
    return true; // If testUrl succeeds, assume folder is public
  } catch (error) {
    console.error('%c [ Folder Access Error ]', 'font-size:13px; background:red; color:#fff;', error.response?.data || error.message);
    if (error.response && error.response.status === 403) {
      return false; // Explicitly not public
    }
    return false; // Assume not public for other errors
  }
}


router.post("/update-google-sheet", async (req, res) => {
  try {
    const googleResp = await fetch("https://script.google.com/macros/s/AKfycbzoU9skjFIqA4yKQMfF4Tuh1uhYhk_vNfKjH5pEt4ZRtd9T_ouGSw_SYPiluq3zj62E/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const result = await googleResp;
    console.log('%c [ result ]-712', 'font-size:13px; background:pink; color:#bf2c9f;', result)
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update Google Sheet" });
  }
});





router.post("/import-drive-folder", async (req, res) => {
  try {
    let { folderUrl, vendorId } = req.body;
    // vendorId = vendorId - 10800; // Adjust vendorId as per old logic

    // Validate request
    if (!folderUrl || !vendorId) {
      return res.status(400).json({ message: "Folder URL and Vendor ID are required." });
    }

    const folderId = getFolderIdFromUrl(folderUrl);
    if (!folderId) {
      return res.status(400).json({ message: "Invalid Google Drive folder URL" });
    }

    if (!apiKey) {
      return res.status(500).json({ message: "Google Drive API key not configured" });
    }

        // Check if the folder is publicly accessible
    const isPublic = await isFolderPubliclyAccessible(folderId, apiKey);
    console.log('%c [ isPublic ]-687', 'font-size:13px; background:pink; color:#bf2c9f;', isPublic)
    if (!isPublic) {
      return res.status(400).json({ message: "Google Drive folder link is not publicly accessible." });
    }

    // Find the order by vendorId (assuming vendorId is the order_id, stored as _id in orders collection)
    const order = await OrderModel.findOne({order_id : vendorId - 10800});
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const customerId = order.fromId;
    const phoneNo = order.phone_no;

    // Generate folderName from order details (e.g., "Photos_Wed_Sep_04_2024")
    const folderName = `${vendorId}`;

    // Check if a folder with the same name already exists for the same customer
    let existingFolder = await FolderModel.findOne({
      folderName,
      customerId,
    });

    if (!existingFolder) {
      // Create and save the folder if it doesn't exist
      const folder = new FolderModel({ folderName, customerId, vendorId });
      await folder.save();
      existingFolder = folder; // Update existingFolder to the new one
    }

    // Create temp directory (mimicking multer's diskStorage)
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

    // Define S3 folder path (same as /upload route)
    let folderPath = vendorId ? `${folderName}_${customerId}` : `${folderName}_${customerId}`;

    // Process all files concurrently
    const uploadPromises = files.map(async (file) => {
      try {
        const originalName = file.name;
        const fileName = `${Date.now()}_${originalName}`; // Match /upload naming: ${Date.now()}_${originalName}
        const filePath = path.join(tempDir, fileName);
        const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);

        // Download from Google Drive
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
        await downloadFile(downloadUrl, filePath);

        console.log(`Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`);

        // Generate Thumbnail (Parallel)
        const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

        // Upload Original Image (Parallel)
        const s3UploadPromise = uploadFileToS3(filePath, fileName, folderPath, phoneNo);

        await thumbnailPromise; // Ensure thumbnail is generated before uploading

        // Upload Thumbnail (Parallel)
        const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`;
        const s3ThumbPromise = uploadFileToS3(thumbnailPath, thumbnailFileName, folderPath, phoneNo);

        // Wait for both uploads to complete
        const [s3Response, s3ThumbResponse] = await Promise.all([
          s3UploadPromise,
          s3ThumbPromise,
        ]);

        // Cleanup local files (async with error handling)
        try {
          await fsp.unlink(filePath);
          console.log(`Deleted local file: ${filePath}`);
        } catch (unlinkError) {
          console.error(`Error deleting local file ${filePath}:`, unlinkError.message);
        }
        try {
          await fsp.unlink(thumbnailPath);
          console.log(`Deleted local thumbnail: ${thumbnailPath}`);
        } catch (unlinkError) {
          console.error(`Error deleting local thumbnail ${thumbnailPath}:`, unlinkError.message);
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
        // Cleanup local files in case of error
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = path.join(tempDir, fileName);
        const thumbnailPath = path.join(tempDir, `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`);
        try {
          if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath);
            console.log(`Deleted local file (error case): ${filePath}`);
          }
          if (fs.existsSync(thumbnailPath)) {
            await fsp.unlink(thumbnailPath);
            console.log(`Deleted local thumbnail (error case): ${thumbnailPath}`);
          }
        } catch (unlinkError) {
          console.error(`Error deleting local files in error case:`, unlinkError.message);
        }
        return { fileName: file.name, error: error.message };
      }
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    const orderGalleryLink = `https://horaservices.com/photo-gallery?folderName=${folderName}&customerId=${customerId}`;
    const orderDriveLink = folderUrl;

    await OrderModel.updateOne({ order_id: vendorId - 10800 }, { $set: { orderGalleryLink, orderDriveLink } });

    res.status(201).json({
      message: "Files uploaded successfully from Google Drive.",
      files: uploadedFiles,
      folderDetails : { folderName, customerId, vendorId, phoneNo, order_date : order.order_date }
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
        console.log(`Deleted empty temp directory: ${tempDir}`);
      }
    } catch (error) {
      console.error(`Error cleaning up temp directory ${tempDir}:`, error.message);
    }
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




// const express = require("express");
// const router = express.Router();
// const mongoose = require("mongoose");
// const https = require("https"); // ✅ using https instead of axios
// const fs = require("fs");
// const path = require("path");
// const AWS = require("aws-sdk");
// const DriveImportedImages = require("../models/driveImportedImages"); // Adjust path if needed
// const { generateThumbnail, uploadFileToS3 } = require("../store/multerS3Config"); // From your existing code

// // AWS S3 Configuration (copied from your existing code)
// const s3 = new AWS.S3({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   region: process.env.AWS_REGION,
// });

// const S3_BUCKET = process.env.S3_BUCKET_NAME;
// const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

// // ✅ Helper: Fetch JSON using https
// function fetchJson(url) {
//   return new Promise((resolve, reject) => {
//     https
//       .get(url, (res) => {
//         let data = "";
//         res.on("data", (chunk) => (data += chunk));
//         res.on("end", () => {
//           try {
//             resolve(JSON.parse(data));
//           } catch (err) {
//             reject(err);
//           }
//         });
//       })
//       .on("error", reject);
//   });
// }

// // ✅ Helper: Download file from URL to local path
// function downloadFile(url, dest) {
//   return new Promise((resolve, reject) => {
//     const file = fs.createWriteStream(dest);
//     https
//       .get(url, (res) => {
//         res.pipe(file);
//         file.on("finish", () => {
//           file.close(resolve);
//         });
//       })
//       .on("error", (err) => {
//         fs.unlink(dest, () => reject(err));
//       });
//   });
// }

// // Helper: Extract folder ID from Google Drive URL
// function getFolderIdFromUrl(url) {
//   const regex = /\/folders\/([a-zA-Z0-9_-]+)(\?.*)?$/;
//   const match = url.match(regex);
//   return match ? match[1] : null;
// }

// // Helper: Upload image to S3
// async function uploadImageToS3(filePath, fileName, userId, mimeType) {
//   const folderName = "drive-imported"; // New folder in S3 for these images
//   const key = `${folderName}/${userId}/${fileName}`;
//   const params = {
//     Bucket: S3_BUCKET,
//     Key: key,
//     Body: fs.createReadStream(filePath),
//     ContentType: mimeType,
//   };
//   const data = await s3.upload(params).promise();
//   return { Location: data.Location, Key: data.Key };
// }

// // ✅ POST /import-drive-folder
// router.post("/import-drive-folder", async (req, res) => {
//   try {
//     const { folderName, customerId, vendorId, phoneNo, folderUrl } = req.body;

//     // Validate request
//     if (!folderName || !customerId || !folderUrl) {
//       return res
//         .status(400)
//         .json({
//           message: "Folder Name, Customer ID, and Folder URL are required.",
//         });
//     }

//     const folderId = getFolderIdFromUrl(folderUrl);
//     if (!folderId) {
//       return res.status(400).json({ message: "Invalid Google Drive folder URL" });
//     }

//     if (!apiKey) {
//       return res
//         .status(500)
//         .json({ message: "Google Drive API key not configured" });
//     }

//     // List all image files in the folder using Google Drive API
//     let files = [];
//     let pageToken = null;
//     do {
//       let listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'%20in%20parents%20and%20trashed=false%20and%20mimeType%20contains%20'image/'&key=${apiKey}&fields=nextPageToken,files(id,name,mimeType)`;
//       if (pageToken) listUrl += `&pageToken=${pageToken}`;
//       const listRes = await fetchJson(listUrl);
//       files = files.concat(listRes.files || []);
//       pageToken = listRes.nextPageToken;
//     } while (pageToken);

//     if (files.length === 0) {
//       return res.status(404).json({ message: "No images found in the folder" });
//     }

//     // Define S3 folder path
//     let folderPath = vendorId
//       ? `${folderName}_${customerId}_${vendorId}`
//       : `${folderName}_${customerId}`;

//     // Temp directory for downloads
//     const tempDir = "./Uploads/";
//     if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

//     // Process all files concurrently
//     const uploadPromises = files.map(async (file) => {
//       try {
//         const originalName = file.name;
//         const fileName = `${Date.now()}-${originalName}`;
//         const filePath = path.join(tempDir, fileName);
//         const thumbnailPath = path.join(
//           tempDir,
//           `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`
//         );

//         // Download from Google Drive
//         const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
//         await downloadFile(downloadUrl, filePath);

//         console.log(`Processing file: ${fileName} at ${new Date().toLocaleTimeString()}`);

//         // Generate Thumbnail
//         const thumbnailPromise = generateThumbnail(filePath, thumbnailPath);

//         // Upload Original Image
//         const s3UploadPromise = uploadFileToS3(
//           filePath,
//           fileName,
//           folderPath,
//           phoneNo
//         );

//         await thumbnailPromise; // Ensure thumbnail generated

//         // Upload Thumbnail
//         const thumbnailFileName = `thumb_${fileName.replace(/\.(png|jpeg|jpg)$/i, "")}.webp`;
//         const s3ThumbPromise = uploadFileToS3(
//           thumbnailPath,
//           thumbnailFileName,
//           folderPath,
//           phoneNo
//         );

//         // Wait for both uploads
//         const [s3Response, s3ThumbResponse] = await Promise.all([
//           s3UploadPromise,
//           s3ThumbPromise,
//         ]);

//         // Cleanup local files
//         fs.unlinkSync(filePath);
//         fs.unlinkSync(thumbnailPath);

//         return {
//           fileName: originalName,
//           fileUrl: s3Response.Location,
//           s3Key: s3Response.Key,
//           thumbnailUrl: s3ThumbResponse.Location,
//           thumbnailKey: s3ThumbResponse.Key,
//         };
//       } catch (error) {
//         console.error(`Error processing ${file.name}:`, error);
//         return { fileName: file.name, error: error.message };
//       }
//     });

//     const uploadedFiles = await Promise.all(uploadPromises);

//     res.status(201).json({
//       message: "Files uploaded successfully from Google Drive.",
//       files: uploadedFiles,
//     });
//   } catch (error) {
//     console.error("Drive Upload error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

// // ✅ GET /drive-imported-images/:userId
// router.get("/drive-imported-images/:userId", async (req, res) => {
//   const { userId } = req.params;

//   if (!mongoose.Types.ObjectId.isValid(userId)) {
//     return res.status(400).json({ error: true, message: "Invalid user ID" });
//   }

//   try {
//     const doc = await DriveImportedImages.findOne({ userId }).lean();
//     if (!doc || !doc.images || doc.images.length === 0) {
//       return res
//         .status(404)
//         .json({ error: true, message: "No images found for this user" });
//     }

//     const sortedImages = doc.images.sort(
//       (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
//     );

//     return res.status(200).json({
//       error: false,
//       message: "Images fetched successfully",
//       data: {
//         userId,
//         images: sortedImages,
//         totalImages: sortedImages.length,
//       },
//     });
//   } catch (err) {
//     console.error("Fetch Images Error:", {
//       message: err.message,
//       stack: err.stack,
//       userId,
//     });
//     return res.status(500).json({
//       error: true,
//       message: "Server error",
//       details: err.message,
//     });
//   }
// });

// module.exports = router;
