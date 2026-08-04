const express = require("express");
const router = express.Router();
const WebLink = require("../models/weblink-images");
const Order = require("../models/order");
const Folder = require("../models/folder");
const User = require("../models/user");
const Users = require("../models/user");
const mongoose = require("mongoose");
const capsuleGenerateShortCode = require("../utils/capsuleGenerateShortCode");
const { uploadFileToS3 } = require("../store/multerS3Config");
const path = require("path");
const fsPromises = require("fs").promises; 
const fs = require("fs");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const EventinvitesModel = require("../models/event-invite");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { s3, S3_BUCKET } = require("../utils/awsConfigs");
const { generateThumbnail } = require("../store/multerS3Config");


async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

router.put("/assign-to-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({ message: "subFolderId is required" });
    }

    if (addImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: addImageIds } },
        { $addToSet: { folderIds: subFolderId } }
      );
    }

    if (removeImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: removeImageIds } },
        { $pull: { folderIds: subFolderId } }
      );
    }

    return res.status(200).json({
      message: "Subfolder updated successfully",
      added: addImageIds.length,
      removed: removeImageIds.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/toggle-like", async (req, res) => {
  try {
    const { imageIds = [], userId } = req.body;

    if (!userId || imageIds.length === 0) {
      return res.status(400).json({
        message: "userId and imageIds are required",
      });
    }

    const updatedImages = [];

    for (const imageId of imageIds) {
      const image = await WebLink.findById(imageId);

      if (!image) continue;

      const alreadyLiked = image.likedBy.includes(userId);

      if (alreadyLiked) {
        await WebLink.updateOne(
          { _id: imageId },
          { $pull: { likedBy: userId } }
        );
      } else {
        await WebLink.updateOne(
          { _id: imageId },
          { $addToSet: { likedBy: userId } }
        );
      }

      updatedImages.push({
        imageId,
        liked: !alreadyLiked,
      });
    }

    return res.status(200).json({
      message: "Like status updated",
      data: updatedImages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/capsule-tracking", async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const date = req.query.date; 

    const matchQuery = {
      type: 8,
      orderWebLink: {
        $exists: true,
        $nin: ["", " ", null]
      }
    };

    if (search) {
      matchQuery.order_id = Number(search);
    }

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000+05:30`);

      const endOfDay = new Date(`${date}T23:59:59.999+05:30`);

      matchQuery["imageUploadCounts.driveProvidedAt"] = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }

    const [orders, totalOrders] = await Promise.all([

      Order.aggregate([

        {
          $match: matchQuery
        },

        {
          $sort: {
            "imageUploadCounts.driveProvidedAt": -1,
            createdAt: -1
          }
        },

        {
          $skip: skip
        },

        {
          $limit: limit
        },

        // Folder Lookup
        {
          $addFields: {
            orderIdString: {
              $toString: "$order_id"
            }
          }
        },

        {
          $lookup: {
            from: "folders",
            let: { searchId: "$orderIdString" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: ["$orderId", "$$searchId"] },
                      { $eq: ["$orderId", { $toString: { $add: [{ $toInt: "$$searchId" }, 10800] } }] }
                    ]
                  }
                }
              },
              { $limit: 1 } 
            ],
            as: "folder"
          }
        },

        {
          $unwind: {
            path: "$folder",
            preserveNullAndEmptyArrays: true
          }
        },

        {
  $addFields: {
    lockerSubFolderId: {
      $arrayElemAt: [
        {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$folder.subFolders", []] },
                as: "sf",
                cond: {
                  $eq: ["$$sf.isLocker", true]
                }
              }
            },
            as: "locker",
            in: "$$locker._id"
          }
        },
        0
      ]
    }
  }
},


        {
          $addFields: {
            firstDeviceType: {
              $arrayElemAt: [
                {
                  $map: {
                    input: { $ifNull: ["$folder.deviceTracking", []] },
                    as: "d",
                    in: "$$d.deviceType"
                  }
                },
                0
              ]
            },

            secondDeviceType: {
              $arrayElemAt: [
                {
                  $map: {
                    input: { $ifNull: ["$folder.deviceTracking", []] },
                    as: "d",
                    in: "$$d.deviceType"
                  }
                },
                1
              ]
            }
          }
        },

        // Weblinks Lookup
        {
          $lookup: {
            from: "weblinks",
            localField: "folder._id",
            foreignField: "mainFolderId",
            as: "media"
          }
        },

{
  $addFields: {

    imageCount: {
      $size: {
        $filter: {
          input: "$media",
          as: "m",
          cond: {
            $eq: ["$$m.type", "image"]
          }
        }
      }
    },

    lockerImageCount: {
      $size: {
        $filter: {
          input: "$media",
          as: "m",
          cond: {
            $and: [
              {
                $eq: ["$$m.type", "image"]
              },
              {
                $in: [
                  "$lockerSubFolderId",
                  { $ifNull: ["$$m.folderIds", []] }
                ]
              }
            ]
          }
        }
      }
    },

    videoCount: {
              $size: {
                $filter: {
                  input: "$media",
                  as: "m",
                  cond: {
                    $eq: ["$$m.type", "video"]
                  }
                }
              }
            },

            totalLikes: {
              $sum: {
                $map: {
                  input: "$media",
                  as: "m",
                  in: {
                    $size: {
                      $ifNull: ["$$m.likedBy", []]
                    }
                  }
                }
              }
            },

            totalDownloads: {
              $sum: "$media.downloadCount"
            },

            totalShares: {
              $sum: {
                $map: {
                  input: "$media",
                  as: "m",
                  in: {
                    $add: [
                      { $ifNull: ["$$m.galleryImageShareCount", 0] },
                      { $ifNull: ["$$m.shareCount", 0] }
                    ]
                  }
                }
              }
            },

            faceRecognitionCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []]
                  },
                  as: "s",
                  cond: {
                    $eq: ["$$s.type", "my_photos"]
                  }
                }
              }
            },

            otherSubFoldersCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []]
                  },
                  as: "s",
                  cond: {
                    $and: [
                      { $ne: ["$$s.type", "my_photos"] },
                      { $ne: ["$$s.isPersonFolder", true] }
                    ]
                  }
                }
              }
            },

            totalViews: {
              $size: {
                $ifNull: ["$folder.viewedBy", []]
              }
            },

            totalPersonCount: {
              $ifNull: ["$folder.totalPersonCount", 0]
            },

            totalClicks: {
              $ifNull: ["$folder.clickCount", 0]
            },

            shareCapsuleClicks: {
              $ifNull: ["$folder.shareCapsuleCount", 0],
            },
          }
        },

        {
          $project: {
            order_id: 1,
            orderWebLink: 1,
            orderDriveLink: 1,
            allDriveLinks: 1,
            imageUploadCounts: 1,

            mainFolderId: "$folder._id",

            counts: {
              imageCount: "$imageCount",
              videoCount: "$videoCount",
              lockerImageCount: "$lockerImageCount",
              totalMedia: {
                $add: ["$imageCount", "$videoCount"]
              },
              totalLikes: "$totalLikes",
              totalDownloads: "$totalDownloads",
              totalShares: "$totalShares",
              faceRecognitionCount: "$faceRecognitionCount",
              otherSubFoldersCount: "$otherSubFoldersCount",
              totalViews: "$totalViews",
              totalClicks: "$totalClicks",

              firstDeviceType: "$firstDeviceType",
              secondDeviceType: "$secondDeviceType",

              totalPersonCount: "$totalPersonCount",
              shareCapsuleClicks: "$shareCapsuleClicks",
            }
          }
        }

      ]),

      Order.countDocuments(matchQuery)

    ]);

    return res.status(200).json({
      success: true,
      message: "Data fetched successfully",

      pagination: {
        totalItems: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        pageSize: orders.length
      },

      data: orders
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
});

router.post("/track-activity/:mediaId", async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { action } = req.body;

    let updateQuery = {};
    if (action === "download") {
      updateQuery = { $inc: { downloadCount: 1 } };
    } else if (action === "share-event") {
      updateQuery = { $inc: { shareEventCount: 1 } };
    }
    else if (action === "share") {
      updateQuery = { $inc: { galleryImageShareCount: 1 } };
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    await WebLink.findByIdAndUpdate(mediaId, updateQuery);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/track-gallery-view", async (req, res) => {
  try {
    const { userId, mainFolderId } = req.body;

    if (!userId || !mainFolderId) {
      return res.status(400).json({
        success: false,
        message: "userId and mainFolderId are required",
      });
    }
    // Validate Mongo IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(mainFolderId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Check user exists
    const userExists = await Users.findById(userId).select("_id");

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    const folder = await Folder.findOne({ _id: mainFolderId });
    if (!folder) {
      return res.status(404).json({ success: false, message: "Invalid link" });
    }

const alreadyViewed = folder.viewedBy?.some(
  (view) => view.userId === userId
);

    let updatedFolder;

    if (!alreadyViewed) {
      updatedFolder = await Folder.findOneAndUpdate(
        { _id: mainFolderId },
        {
          $push: {
            viewedBy: {
              userId,
              viewedAt: new Date(),
            },
          },
        },
        { new: true }
      );
    } else {
  updatedFolder = folder;
}

    return res.json({
      success: true,
      data: updatedFolder,
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/track-click', async (req, res) => {
  const { mainFolderId } = req.body;

  if (!mainFolderId) return res.status(400).send("mainFolderId is required");

  try {
    const stats = await Folder.findByIdAndUpdate(
      mainFolderId,
      { $inc: { clickCount: 1 } },
      { new: true },
    );

    res.status(200).json({
      success: true,
      currentDailyClicks: stats.clickCount,
    });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).send("Server Error");
  }
});

router.post("/track-capsule-share-click", async (req, res) => {
  const { mainFolderId } = req.body;

  if (!mainFolderId) return res.status(400).send("mainFolderId is required");
  try {
    const stats = await Folder.findByIdAndUpdate(
      mainFolderId,
      { $inc: { shareCapsuleCount: 1 } },
      { new: true },
    );

    res.status(200).json({
      success: true,
      shareCapsuleCount: stats.shareCapsuleCount,
    });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).send("Server Error");
  }
});

router.get("/capsule-users", async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);

    const skip = (page - 1) * limit;

    // =====================================
    // HOST USERS
    // =====================================
    const hostUsers = await Order.aggregate([
      {
        $match: {
          type: 8,
          orderWebLink: {
            $exists: true,
            $nin: ["", " ", null]
          },
          fromId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: [{ $type: "$fromId" }, "object"] },
              then: { $toString: "$fromId._id" }, // Agar by chance object ho
              else: { $toString: "$fromId" }
            }
          },
          phone: { $first: "$phone_no" },
          totalOrders: { $sum: 1 },
          userType: { $first: "host" }
        }
      }
    ]);

    // =====================================
    // GUEST USERS
    // =====================================
    const guestUsers = await Folder.aggregate([
      {
        $match: {
          viewedBy: { $exists: true, $type: "array", $ne: [] }
        }
      },
      {
        $unwind: "$viewedBy"
      },
      {
        $match: {
          viewedBy: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: [{ $type: "$viewedBy" }, "object"] },
              then: { $toString: "$viewedBy.userId" }, 
              else: { $toString: "$viewedBy" }          
            }
          },
          totalOrders: { $first: 0 },
          userType: { $first: "guest" }
        }
      },
      {
        $match: {
          _id: { $ne: "null", $exists: true } 
        }
      }
    ]);

    // =====================================
    // MERGE UNIQUE USERS
    // =====================================
    const userMap = new Map();

    [...hostUsers, ...guestUsers].forEach((user) => {
      if (!user._id || user._id === "null") return; 

      const id = user._id.toString();

      if (userMap.has(id)) {
        const existing = userMap.get(id);
        existing.totalOrders = Math.max(existing.totalOrders, user.totalOrders);
      } else {
        userMap.set(id, user);
      }
    });

    let users = Array.from(userMap.values());

    // =====================================
    // GET USER DATA
    // =====================================
    const userIds = users.map((u) => u._id);

    const [
      uploadCounts,
      likeCounts,
      guestCapsuleCounts,
      userData
    ] = await Promise.all([

      // =====================================
      // UPLOADS
      // =====================================
      WebLink.aggregate([
        {
          $match: {
            orderById: { $in: userIds }
          }
        },
        {
          $group: {
            _id: "$orderById",
            totalUploads: { $sum: 1 }
          }
        }
      ]),

      // =====================================
      // LIKES
      // =====================================
      WebLink.aggregate([
        {
          $match: {
            likedBy: { $exists: true, $type: "array", $ne: [] }
          }
        },
        {
          $unwind: "$likedBy"
        },
        {
          $group: {
            _id: {
              $cond: {
                if: { $eq: [{ $type: "$likedBy" }, "object"] },
                then: { $toString: "$likedBy._id" },
                else: { $toString: "$likedBy" }
              }
            },
            totalLikes: { $sum: 1 }
          }
        },
        {
          $match: {
            _id: { $in: userIds }
          }
        }
      ]),

      // =====================================
      // GUEST CAPSULES
      // =====================================
      Folder.aggregate([
        {
          $match: {
            viewedBy: { $exists: true, $type: "array", $ne: [] }
          }
        },
        {
          $unwind: "$viewedBy"
        },
        {
          $group: {
            _id: {
              $cond: {
                if: { $eq: [{ $type: "$viewedBy" }, "object"] },
                then: { $toString: "$viewedBy.userId" }, 
                else: { $toString: "$viewedBy" }
              }
            },
            guestCapsulesCount: { $sum: 1 }
          }
        },
        {
          $match: {
            _id: { $in: userIds }
          }
        }
      ]),

      // =====================================
      // USER INFO
      // =====================================
      User.find({
        _id: { $in: userIds }
      })
        .select("phone fromCapsule createdAt")
        .lean()
    ]);

    // =====================================
    // MAPS
    // =====================================
    const uploadMap = {};
    const likeMap = {};
    const guestMap = {};
    const userDataMap = {};

    uploadCounts.forEach((u) => {
      if (u._id) uploadMap[u._id.toString()] = u.totalUploads;
    });

    likeCounts.forEach((u) => {
      if (u._id) likeMap[u._id.toString()] = u.totalLikes;
    });

    guestCapsuleCounts.forEach((u) => {
      if (u._id) guestMap[u._id.toString()] = u.guestCapsulesCount;
    });

    userData.forEach((u) => {
      userDataMap[u._id.toString()] = u;
    });

    // =====================================
    // FINAL USERS
    // =====================================
    let finalUsers = users.map((u) => {
      const idStr = u._id.toString();
      const userInfo = userDataMap[idStr] || {};

      return {
        userId: idStr,
        userType: u.userType,
        phone: u.phone || userInfo.phone || null,
        totalOrders: u.totalOrders || 0,
        totalUploads: uploadMap[idStr] || 0,
        totalLikes: likeMap[idStr] || 0,
        guestCapsulesCount: guestMap[idStr] || 0,
        fromCapsule: userInfo.fromCapsule || false,
        createdAt: userInfo.createdAt || null
      };
    });

    // =====================================
    // SEARCH
    // =====================================
    if (search?.trim()) {
      finalUsers = finalUsers.filter((u) =>
        (u.phone || "")
          .toString()
          .includes(search.trim())
      );
    }

    // =====================================
    // SORT (Recent Users First)
    // =====================================
    finalUsers.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    });

    // =====================================
    // TOTAL
    // =====================================
    const total = finalUsers.length;
    finalUsers = finalUsers.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      message: "User data fetched successfully",
      data: finalUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

router.post("/track-device", async (req, res) => {
  try {
    const { mainFolderId, userId, deviceType } = req.body;

    if (!mainFolderId || !userId || !deviceType) {
      return res.status(400).json({
        success: false,
        message: "mainFolderId, userId and deviceType are required",
      });
    }

    const folder = await Folder.findById(mainFolderId);

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    // Same user ko duplicate save nahi karna
    const alreadyTracked = folder.deviceTracking?.some(
      (item) => item.userId === userId
    );

    if (!alreadyTracked) {
      await Folder.findByIdAndUpdate(
        mainFolderId,
        {
          $push: {
            deviceTracking: {
              userId,
              deviceType,
            },
          },
        },
        { new: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: alreadyTracked
        ? "Device already tracked"
        : "Device tracked successfully",
    });
  } catch (error) {
    console.error("Track Device Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});


router.post("/generate-gallery-code/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await Folder.findById(folderId).lean();;
    if (!folder) {
      return res.status(404).json({ success: false, error: true, message: "Folder not found" });
    }

    if (folder.shortCode) {
      return res.status(200).json({
        success: true,
        error: false,
        message: "Short code already exists",
        shortCode: folder.shortCode,
        shortUrl: `https://horaservices.com/eventcapsule/share/${folder.shortCode}`,
      });
    }

    const shortCode = await capsuleGenerateShortCode();

    await Folder.findByIdAndUpdate(folderId, { $set: { shortCode: shortCode } });

    return res.status(200).json({
      success: true,
      error: false,
      message: "Short code generated successfully",
      shortCode,
      shortUrl: `https://horaservices.com/api/internal/${shortCode}`,
    });

  } catch (err) {
    console.error("Error in generating short code:", err);
    return res.status(500).json({ success: false, error: true, message: "Server error" });
  }
});


router.get("/getSubFolders", async (req, res) => {
  try {
    const { folderName } = req.query;

    if (!folderName) {
      return res.status(400).json({ message: "folderName is required" });
    }

    const folder = await Folder.findOne({ folderName }).lean();

    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    const userIds = folder.viewedBy || [];
    const uniqueUserIds = [...new Set(userIds)];


    const users = await User.find({
      _id: { $in: uniqueUserIds }
    })
      .select("_id name firstName lastName phone avatar")
      .lean();

    const userMap = {};
    users.forEach(u => {
      userMap[String(u._id)] = u;
    });


    res.status(200).json({
      folder,
      guestDetails: (folder.viewedBy || []).map(id => userMap[id] || {
        _id: id,
        name: "",
        phone: "",
        avatar: ""
      })
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});


const fontPath = path.resolve(__dirname, "./fonts/CinzelDecorative-Bold.ttf");
if (fs.existsSync(fontPath)) {
  GlobalFonts.registerFromPath(fontPath, "CinzelDecorativeBold");
}

async function generateAndUploadCapsuleBanner(folderId, leftImageInput, eventName, phoneNo = "9876543210") {
  const timestamp = Date.now();
  const tempPngPath = path.join("/tmp", `temp-banner-${folderId}-${timestamp}.png`);
  const tempWebpPath = path.join("/tmp", `temp-banner-${folderId}-${timestamp}.webp`);

  try {
    const scale = 4;
    const baseWidth = 393;
    const baseHeight = 195;

    const width = baseWidth * scale;
    const height = baseHeight * scale;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    const leftBoxWidth = 245 * scale;
    const leftBoxHeight = 195 * scale;

    if (leftImageInput) {
      try {
        let leftImg;
        if (Buffer.isBuffer(leftImageInput)) {
          leftImg = await loadImage(leftImageInput);
        } else if (typeof leftImageInput === "string" && leftImageInput.startsWith("http")) {
          leftImg = await loadImage(leftImageInput);
        }

        if (leftImg) {
          const imgRatio = leftImg.width / leftImg.height;
          const targetRatio = leftBoxWidth / leftBoxHeight;

          let sw = leftImg.width, sh = leftImg.height, sx = 0, sy = 0;

          if (imgRatio > targetRatio) {
            sw = leftImg.height * targetRatio;
            sx = (leftImg.width - sw) / 2;
          } else {
            sh = leftImg.width / targetRatio;
            sy = (leftImg.height - sh) / 2;
          }

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, leftBoxWidth, leftBoxHeight);
          ctx.clip();

          ctx.drawImage(leftImg, sx, sy, sw, sh, 0, 0, leftBoxWidth, leftBoxHeight);
          ctx.restore();
        }
      } catch (imgErr) {
        console.error("Warning: Left image render failed:", imgErr.message);
      }
    }

    const bgPath = path.resolve(__dirname, "./default-capsule-bg.webp");
    const rightBgImg = await loadImage(bgPath);

    const rightX = 179 * scale;
    const rightWidth = width - rightX;

    ctx.drawImage(rightBgImg, rightX, 0, rightWidth, height);
    if (eventName) {
      ctx.save();
      ctx.fillStyle = "#8462ae";

      const textLength = eventName.trim().length;
      let fontSize = 13.5;

      if (textLength > 45) {
        fontSize = 8.5;
      } else if (textLength > 30) {
        fontSize = 10.5;
      } else {
        fontSize = 13.5;
      }

      ctx.font = `700 ${fontSize * scale}px "CinzelDecorativeBold", serif`;

      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const textCenterX = rightX + (rightWidth / 2);

      const maxTextWidth = 120 * scale; 
      const lineHeight = (fontSize * 1.35) * scale;

      const words = eventName.toUpperCase().split(" ");
      let lines = [];
      let currentLine = "";

      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxTextWidth && i > 0) {
          lines.push(currentLine);
          currentLine = words[i];
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);

      const totalTextHeight = lines.length * lineHeight;
      const centerY = (baseHeight * 0.255) * scale;
      const centeredStartY = centerY - (totalTextHeight / 2);

      lines.forEach((line, index) => {
        const lineY = centeredStartY + (index * lineHeight);
        ctx.fillText(line, textCenterX, lineY);
      });

      ctx.restore();
    }

    const canvasBuffer = canvas.toBuffer("image/png");
    await fsPromises.writeFile(tempPngPath, canvasBuffer);

    await generateThumbnail(tempPngPath, tempWebpPath);

    const fileName = `banner-${folderId}-${timestamp}.webp`;
    const folderPath = "capsule-banners";
    const contentType = "image/webp";

    const s3Result = await uploadFileToS3(
      tempWebpPath,
      fileName,
      folderPath,
      phoneNo,
      contentType
    );

    return s3Result.Location || s3Result.fileUrl || s3Result;

  } catch (error) {
    console.error("Backend Banner Generation Error:", error);
    throw error;
  } finally {
    await Promise.all([
      fsPromises.unlink(tempPngPath).catch(() => { }),
      fsPromises.unlink(tempWebpPath).catch(() => { })
    ]);
  }
}


async function handleFolderBannerCreation(req, res) {
  try {
    const { folderId } = req.body;

    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: "folderId is required",
      });
    }

    const folderDoc = await Folder.findById(folderId).lean();

    if (!folderDoc) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const oldBannerUrl = folderDoc.capsuleBannerImageUrl || null;

    const rawOrderId = folderDoc.orderId;

    const order = await Order.findOne({ order_id: rawOrderId }).lean();

    let eventName = ""; 
    let phoneNo = "";

    if (folderDoc.eventId) {
      const eventDoc = await EventinvitesModel.findById(folderDoc.eventId).lean();
      if (eventDoc && eventDoc.hostName) {
        eventName = eventDoc.hostName;
      }
    }

    if (!eventName && order && order.eventName) {
      eventName = order.eventName;
    }


    if (!eventName || !eventName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Banner cannot be generated because event name is missing.",
      });
    }
      

      if (order) {
        phoneNo = order.phone_no || order.online_phone_no || "";
      }

    let leftImageInput = null;
    if (req.file && req.file.buffer) {
      leftImageInput = req.file.buffer; 
    } else if (req.body.leftImageUrl) {
      leftImageInput = req.body.leftImageUrl;
    }

    const s3BannerUrl = await generateAndUploadCapsuleBanner(
      folderId,
      leftImageInput,
      eventName,
      phoneNo
    );

    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      {
        $set: {
          capsuleBannerImageUrl: s3BannerUrl,
        }
      },
      { new: true, strict: false }
    ).lean();


    if (oldBannerUrl && oldBannerUrl !== s3BannerUrl) {
      try {
        // Extract S3 key from URL
        const oldBannerKey = new URL(oldBannerUrl).pathname.substring(1);

        await deleteFromS3(oldBannerKey);

        console.log("Old capsule banner deleted from S3.");
      } catch (err) {
        console.error("Unable to delete old banner:", err);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Capsule banner generated and saved successfully!",
      bannerUrl: s3BannerUrl,
      data: {
        ...updatedFolder,
        capsuleBannerImageUrl: s3BannerUrl
      }
    });

  } catch (error) {
    console.error("Controller Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate banner",
    });
  }
}

router.post(
  "/generate-banner",
  upload.single("leftImage"),
  handleFolderBannerCreation
);

module.exports = router;