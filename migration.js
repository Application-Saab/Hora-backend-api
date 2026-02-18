const WebLink = require("./models/weblink-images"); 
const User = require("./models/user");
const FolderModel = require("./models/folder");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");
require("dotenv").config();

console.log("MONGO_USER:", process.env.MONGO_USER);
console.log("MONGO_PASS:", process.env.MONGO_PASS);
console.log("MONGO_CLUSTER:", process.env.MONGO_CLUSTER);
console.log("MONGO_DATABASE:", process.env.MONGO_DATABASE);


mongoose.set("strictQuery", true);
mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`
);
const database = mongoose.connection;

database.on("error", (error) => {
  console.log(error);
});

database.once("connected", () => {
  console.log("Database Connected index.js");
});


const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const migrationFunction = async (folderName, customerId, vendorId) => {
  try {
    const folder = await FolderModel.findOne({ folderName }).lean();
    if (!folder) {
      console.log(`Folder '${folderName}' not found.`);
      return;
    }

    let phoneNo = null;

    const folderPath = vendorId
      ? `${folderName}_${customerId}_${vendorId}/`
      : `${folderName}_${customerId}/`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: folderPath.trim(),
    };

    const s3Response = await s3.listObjectsV2(params).promise();
    console.log('hello --------------',s3Response.Contents[0])

    const thumbFiles = (s3Response.Contents || []).filter(
      (file) => file.Key.includes("/thumb_")
    );

    // ---------- get thumbnail metadata ----------
    const thumbs = (
      await Promise.all(
        thumbFiles.map(async (file) => {
          try {
            const metadata = await s3
              .headObject({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: file.Key,
              })
              .promise();

            const filePhoneNo = metadata.Metadata?.phoneno;
            phoneNo = filePhoneNo || phoneNo;

            if (!phoneNo || filePhoneNo === phoneNo) {
              return {
                key: file.Key,
                url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`,
              };
            }
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    // ---------- originals (non-thumb, non-video) ----------
    const originalFiles = (s3Response.Contents || []).filter(
      (file) =>
        !file.Key.includes("/thumb_") );

      console.log('originalFiles ----------',originalFiles);

  const originals = (
      await Promise.all(
        originalFiles.map(async (file) => {
          try {
            const metadata = await s3
              .headObject({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: file.Key,
              })
              .promise();

            const filePhoneNo = metadata.Metadata?.phoneno;
            phoneNo = filePhoneNo || phoneNo;

            if (!phoneNo || filePhoneNo === phoneNo) {
              return {
                key: file.Key,
                url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`,
              };
            }
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    
      // ---------- user ----------
    const user = await User.findOne({ phoneNo }).lean();
    if (!user) {
      console.log(`User with phone number '${phoneNo}' not found.`);
      return;
    }

 const originalMap = new Map();

for (const original of originals) {
  const fileName = original.key.split("/").pop(); 
  const baseName = fileName.replace(/\.(jpg|jpeg|png|webp)$/i, "");

  originalMap.set(baseName, original);
}


    // ---------- MIGRATION (IMAGES ONLY) ----------
for (const thumb of thumbs) {
  const thumbName = thumb.key.split("/").pop(); 
  const baseName = thumbName
    .replace(/^thumb_/, "")
    .replace(/\.webp$/i, "");

  const original = originalMap.get(baseName);

  if (!original) {
    console.warn("⚠️ Original not found for:", thumb.key);
    continue;
  }

  await WebLink.updateOne(
    { originalKey: original.key },
    {
      $setOnInsert: {
        mainFolderId: folder._id.toString(),

        orderId: phoneNo,
        orderById: user._id.toString(),
        orderByName: phoneNo,

        type: "image",

        originalKey: original.key,
        originalUrl: original.url,

        thumbnailKey: thumb.key,
        thumbnailImageUrl: thumb.url,

        videoClipKey: null,
        videoClipUrl: null,

        folderIds: [],
      },
    },
    { upsert: true }
  );

  console.log("✅ Migrated:", original.key);
}


  } catch (error) {
    console.error("❌ Error during migration:", error);
  }
};

migrationFunction("pre wedding poses web link", "64137625549b58e3dc39a685", "");



// wedding
// anniversary poses web link
// bacherrolerate
// baby shower weblink
// maternity poses
//birthday poses
// pre wedding
// HaldiandMehndi
// baby shower
// naming ceremony weblink
// engagement weblink
// anniversary poses web link
//House warming weblink
//new born





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

    const thumbFiles =
      (s3Response.Contents || []).filter((file) =>
        file.Key.includes("/thumb_")
      );

    const metadataPromises = thumbFiles.map(async (file) => {
      try {
        const metadata = await s3
          .headObject({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: file.Key,
          })
          .promise();

        const filePhoneNo =
          metadata.Metadata && metadata.Metadata.phoneno;

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
    const filteredThumbnails = allResults.filter(Boolean);

    res.status(200).json({ thumbnails: filteredThumbnails });
  } catch (error) {
    console.error("Error fetching thumbnails:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});