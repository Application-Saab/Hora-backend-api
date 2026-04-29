const express = require("express");
const router = express.Router();
const WebLink = require("../models/weblink-images");
const Order = require("../models/order");
const Folder = require("../models/folder");
const Users = require("../models/user");
const capsuleDailyClicks = require("../models/capsuleDailyClicks")

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      type: 8,
      orderWebLink: {
        $exists: true,
        $ne: "",
        $nin: [null, " "],
      }
    };

    const orders = await Order.find(query)
      .select("order_id orderWebLink fromId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(query);

    const ordersWithCount = await Promise.all(
      orders.map(async (order) => {

        const folder = await Folder.findOne({ orderId: order.order_id })
          .select("_id subFolders viewedBy")
          .lean();

        let imageCount = 0;
        let videoCount = 0;
        let totalLikes = 0;
        let totalDownloads = 0;
        let totalShares = 0;
        let faceRecognitionCount = 0;
        let otherSubFoldersCount = 0;

        let totalViews = 0;
        let totalClicks = 0;

        if (folder) {

          totalViews = folder.viewedBy?.length || 0;

          const { startDate, endDate } = req.query;

          const today = new Date().toISOString().split("T")[0];
          const start = startDate || today;
          const end = endDate || today;

          const clickAgg = await capsuleDailyClicks.aggregate([
            {
              $match: {
                mainFolderId: folder._id,
                date: {
                  $gte: start,
                  $lte: end
                }
              }
            },
            {
              $group: {
                _id: null,
                totalClicks: { $sum: "$clickCount" }
              }
            }
          ]);

          totalClicks = clickAgg[0]?.totalClicks || 0;

          // Subfolder counts
          if (folder.subFolders?.length) {
            faceRecognitionCount = folder.subFolders.filter(
              (sub) => sub.type === "my_photos"
            ).length;

            otherSubFoldersCount = folder.subFolders.filter(
              (sub) => sub.type !== "my_photos"
            ).length;
          }

          // Media data
          const [imgs, vids, mediaData] = await Promise.all([
            WebLink.countDocuments({
              mainFolderId: folder._id,
              type: "image"
            }),
            WebLink.countDocuments({
              mainFolderId: folder._id,
              type: "video"
            }),
            WebLink.find({ mainFolderId: folder._id })
              .select("likedBy downloadCount shareCount")
              .lean()
          ]);

          imageCount = imgs;
          videoCount = vids;

          mediaData.forEach((item) => {
            totalLikes += item.likedBy?.length || 0;
            totalDownloads += item.downloadCount || 0;
            totalShares += item.shareCount || 0;
          });
        }

        return {
          ...order,
          mainFolderId: folder?._id || null,
          counts: {
            imageCount,
            videoCount,
            totalMedia: imageCount + videoCount,
            totalLikes,
            totalDownloads,
            totalShares,
            faceRecognitionCount,
            otherSubFoldersCount,
            totalViews,
            totalClicks
          }
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Data fetched successfully",
      pagination: {
        totalItems: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        pageSize: ordersWithCount.length
      },
      data: ordersWithCount
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
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
    } else if (action === "share") {
      updateQuery = { $inc: { shareCount: 1 } };
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

    const folder = await Folder.findById(mainFolderId);
    if (!folder) {
      return res.status(404).json({ success: false, message: "Invalid link" });
    }

    const user = await Users.findById(userId).select("fromCapsule");

    console.log("User:", user);
    console.log("Before viewedBy:", folder.viewedBy);

    let updatedFolder = folder;

    if (user?.fromCapsule) {
      updatedFolder = await Folder.findByIdAndUpdate(
        mainFolderId,
        {
          $addToSet: { viewedBy: userId },
        },
        { new: true }
      );
    } else {
      console.log("fromCapsule false or user not found");
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

  const today = new Date().toISOString().split('T')[0];

  try {
    const stats = await capsuleDailyClicks.findOneAndUpdate(
      { mainFolderId: mainFolderId, date: today },
      { $inc: { clickCount: 1 } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    res.status(200).json({
      success: true,
      currentDailyClicks: stats.clickCount,
      date: stats.date
    });
  } catch (error) {
    console.error("Tracking Error:", error);
    res.status(500).send("Server Error");
  }
});


module.exports = router;
