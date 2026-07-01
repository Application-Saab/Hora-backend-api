const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();
const fss = require('fs')
const ffmpeg = require('fluent-ffmpeg');

const router = express.Router();

// AWS S3 Configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Multer Configuration (Stores file locally first)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fss.existsSync(uploadPath)) {
            fss.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ storage });

// Upload to S3 Function

const uploadFileToS3 = async (filePath, fileName, folderPath , phoneNo, contentType) => {
    const fileContent = fss.readFileSync(filePath);

    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `${folderPath}/${fileName}`,
        Body: fileContent,
        ContentType: contentType || 'image/jpeg', // Modify based on file type
        Metadata: {
            phoneNo: phoneNo
        }
    };

    return s3.upload(params).promise();
};

// Function to Generate Thumbnail (max width: 200px, under 100KB)
const fs = require('fs').promises;


const generateThumbnail = async (inputPath, outputPath) => {
    try {
        // Resize and compress in a single step
        const outputBuffer = await sharp(inputPath)
            .rotate()
            .resize({ width: 400, withoutEnlargement: true })
            .webp({ quality: 50 })
            .withMetadata({ orientation: 1 })
            .toBuffer();

        // If the image is still too large, reduce quality a bit
        const finalBuffer = outputBuffer.length > 100 * 1024
            ? await sharp(outputBuffer).webp({ quality: 1 }).toBuffer()
            : outputBuffer;

        // Save thumbnail
        await fs.writeFile(outputPath, finalBuffer);

        console.log(`Thumbnail saved at: ${outputPath} (Size: ${(finalBuffer.length / 1024).toFixed(2)} KB)`);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
    }
};


const generateTemplateThumbnail = async (inputPath, outputPath) => {
        try {
        // Resize and compress in a single step
        const outputBuffer = await sharp(inputPath).rotate().webp({ quality: 90 }).withMetadata({ orientation: 1 })
        .toBuffer();

        // If the image is still too large, reduce quality a bit
        const finalBuffer = outputBuffer.length > 200 * 1024
        ? await sharp(outputBuffer).webp({ quality: 80 }).toBuffer()
        : outputBuffer;

        // Save thumbnail
        await fs.writeFile(outputPath, finalBuffer);

        console.log(`Thumbnail saved at: ${outputPath} (Size: ${(finalBuffer.length / 1024).toFixed(2)} KB)`);
    } catch (error) {
        console.error('Error generating thumbnail:', error);
    }
};


// helper to generate 3-4s preview clip


// Try to set ffmpeg path from ffmpeg-static (optional fallback)
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
} catch (e) {
  // ffmpeg-static not installed — fluent-ffmpeg will try system ffmpeg (/usr/bin/ffmpeg)
}

const generateVideoPreview = (inputPath, outputPath, duration = 4, start = 0) => {
  return new Promise((resolve, reject) => {
    // ensure output dir exists
    const outDir = path.dirname(outputPath);
    if (!fss.existsSync(outDir)) fss.mkdirSync(outDir, { recursive: true });

    ffmpeg(inputPath)
      .setStartTime(start)               // start from beginning or a small offset
      .setDuration(duration)             // seconds
      .videoCodec('libx264')             // re-encode for compatibility & size
      .outputOptions([
        '-crf 28',                       // quality (higher -> smaller)
        '-preset veryfast',              // speed
        '-movflags +faststart',          // streaming friendly
        '-pix_fmt yuv420p',              // compatibility
        '-an'                            // remove audio to reduce size (optional)
      ])
      .size('640x?')                     // scale width to 640, keep aspect
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
};

const compressVideo = (inputPath, outputPath, crf = 28) => {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(outputPath);
    if (!fss.existsSync(outDir)) fss.mkdirSync(outDir, { recursive: true });

    ffmpeg(inputPath)
      .videoCodec('libx264')
      .outputOptions([
        `-crf ${crf}`,             // quality level 28(medium) = small size
        '-preset veryfast',        // fast encoding
        '-movflags +faststart',    // progressive playback
        '-pix_fmt yuv420p',        // max compatibility
        '-acodec aac',             // compress audio
        '-b:a 128k'                // audio bitrate
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
};




// Export both upload and uploadFileToS3 functions properly
module.exports = { uploadFileToS3, upload, generateThumbnail, generateTemplateThumbnail, generateVideoPreview, compressVideo };
