const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();
const fss = require('fs')

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
        const outputBuffer = await sharp(inputPath).rotate().webp({ quality: 50 }).withMetadata({ orientation: 1 })
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

// Export both upload and uploadFileToS3 functions properly
module.exports = { uploadFileToS3, upload, generateThumbnail };
