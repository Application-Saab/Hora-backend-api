const express = require("express");
const router = express.Router();
const WebLink = require("../models/weblink-images");
const Order = require("../models/order");
const Folder = require("../models/folder");
const User = require("../models/user");
const Users = require("../models/user");
const mongoose = require("mongoose");
const FolderModel = require("../models/folder")

router.put("/assign-to-subfolder", async (req, res) => {
  try {
    const { subFolderId, addImageIds = [], removeImageIds = [] } = req.body;

    if (!subFolderId) {
      return res.status(400).json({ message: "subFolderId is required" });
    }

    if (addImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: addImageIds } },
        { $addToSet: { folderIds: subFolderId } },
      );
    }

    if (removeImageIds.length > 0) {
      await WebLink.updateMany(
        { _id: { $in: removeImageIds } },
        { $pull: { folderIds: subFolderId } },
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
          { $pull: { likedBy: userId } },
        );
      } else {
        await WebLink.updateOne(
          { _id: imageId },
          { $addToSet: { likedBy: userId } },
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

    const matchQuery = {
      type: 8,
      orderWebLink: {
        $exists: true,
        $nin: ["", " ", null],
      },
    };

    if (search) {
      matchQuery.order_id = Number(search);
    }

    const [orders, totalOrders] = await Promise.all([
      Order.aggregate([
        {
          $match: matchQuery,
        },

        {
          $sort: {
            "imageUploadCounts.driveProvidedAt": -1,
            createdAt: -1,
          },
        },

        {
          $skip: skip,
        },

        {
          $limit: limit,
        },

        // Folder Lookup
        {
          $addFields: {
            orderIdString: {
              $toString: "$order_id",
            },
          },
        },

        {
          $lookup: {
            from: "folders",
            localField: "orderIdString",
            foreignField: "orderId",
            as: "folder",
          },
        },

        {
          $unwind: {
            path: "$folder",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Weblinks Lookup
        {
          $lookup: {
            from: "weblinks",
            localField: "folder._id",
            foreignField: "mainFolderId",
            as: "media",
          },
        },

        {
          $addFields: {
            imageCount: {
              $size: {
                $filter: {
                  input: "$media",
                  as: "m",
                  cond: {
                    $eq: ["$$m.type", "image"],
                  },
                },
              },
            },

            videoCount: {
              $size: {
                $filter: {
                  input: "$media",
                  as: "m",
                  cond: {
                    $eq: ["$$m.type", "video"],
                  },
                },
              },
            },

            totalLikes: {
              $sum: {
                $map: {
                  input: "$media",
                  as: "m",
                  in: {
                    $size: {
                      $ifNull: ["$$m.likedBy", []],
                    },
                  },
                },
              },
            },

            totalDownloads: {
              $sum: "$media.downloadCount",
            },

            totalShares: {
              $sum: "$media.shareCount",
            },

            faceRecognitionCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []],
                  },
                  as: "s",
                  cond: {
                    $eq: ["$$s.type", "my_photos"],
                  },
                },
              },
            },

            otherSubFoldersCount: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ["$folder.subFolders", []],
                  },
                  as: "s",
                  cond: {
                    $ne: ["$$s.type", "my_photos"],
                  },
                },
              },
            },

            totalViews: {
              $size: {
                $ifNull: ["$folder.viewedBy", []],
              },
            },

            totalClicks: {
              $ifNull: ["$folder.clickCount", 0],
            },

            shareCapsuleClicks: {
              $ifNull: ["$folder.shareCapsuleCount", 0],
            },
          },
        },

        {
          $project: {
            order_id: 1,
            orderWebLink: 1,
            imageUploadCounts: 1,

            mainFolderId: "$folder._id",

            counts: {
              imageCount: "$imageCount",
              videoCount: "$videoCount",
              totalMedia: {
                $add: ["$imageCount", "$videoCount"],
              },
              totalLikes: "$totalLikes",
              totalDownloads: "$totalDownloads",
              totalShares: "$totalShares",
              faceRecognitionCount: "$faceRecognitionCount",
              otherSubFoldersCount: "$otherSubFoldersCount",
              totalViews: "$totalViews",
              totalClicks: "$totalClicks",
              shareCapsuleClicks: "$shareCapsuleClicks",
            },
          },
        },
      ]),

      Order.countDocuments(matchQuery),
    ]);

    return res.status(200).json({
      success: true,
      message: "Data fetched successfully",

      pagination: {
        totalItems: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        pageSize: orders.length,
      },

      data: orders,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
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
    } else if (action === "share") {
      updateQuery = { $inc: { shareCount: 1 } };
    } else if (action === "share-event") {
      updateQuery = { $inc: { shareEventCount: 1 } };
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
    const userExists = await User.findById(userId).select("_id");

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const folder = await Folder.findById(mainFolderId);
    if (!folder) {
      return res.status(404).json({ success: false, message: "Invalid link" });
    }

    const updatedFolder = await Folder.findByIdAndUpdate(
      mainFolderId,
      {
        $addToSet: { viewedBy: userId },
      },
      { new: true },
    );

    return res.json({
      success: true,
      data: updatedFolder,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/track-click", async (req, res) => {
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
            $nin: ["", " ", null],
          },
        },
      },

      {
        $group: {
          _id: {
            $toString: "$fromId",
          },

          phone: {
            $first: "$phone_no",
          },

          totalOrders: {
            $sum: 1,
          },

          userType: {
            $first: "host",
          },
        },
      },
    ]);

    // =====================================
    // GUEST USERS
    // =====================================

    const guestUsers = await Folder.aggregate([
      {
        $match: {
          viewedBy: {
            $exists: true,
            $ne: [],
          },
        },
      },

      {
        $unwind: "$viewedBy",
      },

      {
        $match: {
          $expr: {
            $ne: ["$viewedBy", "$customerId"],
          },
        },
      },

      {
        $group: {
          _id: {
            $toString: "$viewedBy",
          },

          totalOrders: {
            $first: 0,
          },

          userType: {
            $first: "guest",
          },
        },
      },
    ]);

    // =====================================
    // MERGE UNIQUE USERS
    // =====================================

    const userMap = new Map();

    [...hostUsers, ...guestUsers].forEach((user) => {
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

    const [uploadCounts, likeCounts, guestCapsuleCounts, userData] =
      await Promise.all([
        // =====================================
        // UPLOADS
        // =====================================

        WebLink.aggregate([
          {
            $match: {
              orderById: {
                $in: userIds,
              },
            },
          },

          {
            $group: {
              _id: "$orderById",
              totalUploads: {
                $sum: 1,
              },
            },
          },
        ]),

        // =====================================
        // LIKES
        // =====================================

        WebLink.aggregate([
          {
            $unwind: "$likedBy",
          },

          {
            $match: {
              likedBy: {
                $in: userIds,
              },
            },
          },

          {
            $group: {
              _id: {
                $toString: "$likedBy",
              },

              totalLikes: {
                $sum: 1,
              },
            },
          },
        ]),

        // =====================================
        // GUEST CAPSULES
        // =====================================

        Folder.aggregate([
          {
            $unwind: "$viewedBy",
          },

          {
            $match: {
              viewedBy: {
                $in: userIds,
              },
            },
          },

          {
            $match: {
              $expr: {
                $ne: ["$viewedBy", "$customerId"],
              },
            },
          },

          {
            $group: {
              _id: {
                $toString: "$viewedBy",
              },

              guestCapsulesCount: {
                $sum: 1,
              },
            },
          },
        ]),

        // =====================================
        // USER INFO
        // =====================================

        User.find({
          _id: {
            $in: userIds,
          },
        })
          .select("phone fromCapsule createdAt")
          .lean(),
      ]);

    // =====================================
    // MAPS
    // =====================================

    const uploadMap = {};
    const likeMap = {};
    const guestMap = {};
    const userDataMap = {};

    uploadCounts.forEach((u) => {
      uploadMap[u._id] = u.totalUploads;
    });

    likeCounts.forEach((u) => {
      likeMap[u._id] = u.totalLikes;
    });

    guestCapsuleCounts.forEach((u) => {
      guestMap[u._id] = u.guestCapsulesCount;
    });

    userData.forEach((u) => {
      userDataMap[u._id.toString()] = u;
    });

    // =====================================
    // FINAL USERS
    // =====================================

    let finalUsers = users.map((u) => {
      const userInfo = userDataMap[u._id] || {};

      return {
        userId: u._id,

        userType: u.userType,

        phone: u.phone || userInfo.phone || null,

        totalOrders: u.totalOrders || 0,

        totalUploads: uploadMap[u._id] || 0,

        totalLikes: likeMap[u._id] || 0,

        guestCapsulesCount: guestMap[u._id] || 0,

        fromCapsule: userInfo.fromCapsule || false,

        createdAt: userInfo.createdAt || null,
      };
    });

    // =====================================
    // SEARCH
    // =====================================

    if (search?.trim()) {
      finalUsers = finalUsers.filter((u) =>
        (u.phone || "").toString().includes(search.trim()),
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

    // =====================================
    // PAGINATION
    // =====================================

    finalUsers = finalUsers.slice(skip, skip + limit);

    // =====================================
    // RESPONSE
    // =====================================

    return res.status(200).json({
      success: true,

      message: "User data fetched successfully",

      data: finalUsers,

      pagination: {
        total,

        page,

        limit,

        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
});

router.get("/getSubFolders", async (req, res) => {
  try {
    const { folderName } = req.query;

    if (!folderName) {
      return res.status(400).json({ message: "folderName is required" });
    }

    const folder = await FolderModel.findOne({ folderName }).lean();

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


router.get("/weblink-gallery-images", async (req, res) => {
  try {
    const { folderName, customerId, subFolderId, page = 1, limit = 10 } = req.query;
        const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    if (!folderName) {
      return res.status(400).json({
        message: "folderName is required.",
      });
    }

    const folderNames = folderName.split(",");

    const folders = await FolderModel.find({
      folderName: { $in: folderNames },
    }).lean();

    if (!folders.length) {
      return res.status(404).json({
        message: "No folders found.",
      });
    }

    const userIds = folders.flatMap(f => f.viewedBy || []);
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

    const folderIds = folders.map((f) => f._id);

     let query = {
      mainFolderId: { $in: folderIds },
    };

    if (subFolderId) {
      query.folderIds = { $in: [subFolderId] };
    }

    const totalCount = await WebLink.countDocuments(query);

    const images = await WebLink.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const thumbnails = images.map((img) => ({
      ...img,
    }));

    /* =========================
           4Final Response
        ========================= */
    res.status(200).json({
      // folders:enrichedFolders,
      thumbnails,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalItems: totalCount,
        limit: limitNumber,
      }
    });
  } catch (error) {
    console.error("Error fetching thumbnails:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});


module.exports = router;
