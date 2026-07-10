const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SearchTrackings = require("../models/search-tracking");
const { CustomResponse } = require("../store/commonFunction");

// Save Search Analytics
router.post("/", async (req, res) => {
  try {
    const {
      searchTerm,
      clickedItemId,
      clickedTitle,
      clickedType,
      userId,
      visitorId,
    } = req.body;

    const analytics = new SearchTrackings({
      searchTerm,
      ...(clickedItemId && { clickedItemId }),
      ...(clickedTitle && { clickedTitle }),
      ...(clickedType && { clickedType }),
      ...(userId && { userId }),
      ...(visitorId && { visitorId }),
    });

    const savedAnalytics = await analytics.save();

    return CustomResponse(
      res,
      201,
      false,
      "Search analytics saved successfully",
      savedAnalytics,
    );
  } catch (err) {
    console.error("Save Search Analytics Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Get Search Tracking List for admin panel
router.get("/tracking-list", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", clickedType = "" } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const match = {};

    if (clickedType) {
      match.clickedType = clickedType;
    }

    const pipeline = [
      {
        $match: match,
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { searchTerm: { $regex: search, $options: "i" } },
            { clickedTitle: { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } },
            { "user.phone": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      {
        $project: {
          searchTerm: 1,
          clickedItemId: 1,
          clickedTitle: 1,
          clickedType: 1,
          visitorId: 1,
          createdAt: 1,

          user: {
            _id: "$user._id",
            name: "$user.name",
            phone: "$user.phone",
          },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: Number(limit),
      },
    );

    const trackingList = await SearchTrackings.aggregate(pipeline);

    const totalPipeline = pipeline.slice(0, pipeline.length - 3);
    totalPipeline.push({
      $count: "total",
    });

    const totalResult = await SearchTrackings.aggregate(totalPipeline);

    const total = totalResult.length ? totalResult[0].total : 0;

    return CustomResponse(
      res,
      200,
      false,
      "Search tracking fetched successfully",
      {
        trackingList,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    );
  } catch (err) {
    console.error("Fetch Search Tracking Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Link visitor history with logged-in user
router.patch("/assign-user", async (req, res) => {
  try {
    const { visitorId, userId } = req.body;

    if (!visitorId) {
      return CustomResponse(res, 400, true, "visitorId is required");
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return CustomResponse(res, 400, true, "Valid userId is required");
    }

    const result = await SearchTrackings.updateMany(
      {
        visitorId,
        $or: [{ userId: { $exists: false } }, { userId: null }],
      },
      {
        $set: {
          userId,
        },
      },
    );

    return CustomResponse(
      res,
      200,
      false,
      "Visitor history linked successfully",
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    );
  } catch (err) {
    console.error("Assign User Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Get all stats for search tracking
router.get("/stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchStage },

      {
        $facet: {
          // Basic Stats
          totalStats: [
            {
              $group: {
                _id: null,
                totalSearches: { $sum: 1 },
                totalClicks: {
                  $sum: { $cond: [{ $ifNull: ["$clickedItemId", false] }, 1, 0] },
                },
                uniqueLoggedInUsers: {
                  $addToSet: { $cond: [{ $ifNull: ["$userId", false] }, "$userId", null] },
                },
              },
            },
            {
              $project: {
                totalSearches: 1,
                totalClicks: 1,
                uniqueLoggedInUsers: {
                  $size: {
                    $filter: {
                      input: "$uniqueLoggedInUsers",
                      cond: { $ne: ["$$this", null] },
                    },
                  },
                },
              },
            },
          ],

          // Unique Pure Guest Visitors (never logged in)
          uniqueGuestVisitors: [
            {
              $match: { userId: null },
            },
            {
              $group: {
                _id: "$visitorId",
              },
            },
            {
              $count: "count",
            },
          ],

          // Total Searches as Guest Only
          guestSearches: [
            {
              $match: { userId: null },
            },
            {
              $group: {
                _id: null,
                totalGuestSearches: { $sum: 1 },
                guestClicks: {
                  $sum: { $cond: [{ $ifNull: ["$clickedItemId", false] }, 1, 0] },
                },
              },
            },
          ],

          // Top 10 Search Terms (case-insensitive + trimmed)
          topSearchTerms: [
            {
              $group: {
                _id: {
                  $trim: {
                    input: { $toLower: "$searchTerm" },
                  },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
              $project: {
                searchTerm: "$_id",
                count: 1,
              },
            },
          ],

          // Top 10 Clicked by Type (Themes, Products, Categories)
          topClickedThemes: [
            { $match: { clickedType: "theme", clickedItemId: { $ne: null } } },
            {
              $group: {
                _id: { id: "$clickedItemId", title: "$clickedTitle" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
              $project: {
                itemId: "$_id.id",
                title: "$_id.title",
                type: "theme",
                count: 1,
              },
            },
          ],

          topClickedProducts: [
            { $match: { clickedType: "product", clickedItemId: { $ne: null } } },
            {
              $group: {
                _id: { id: "$clickedItemId", title: "$clickedTitle" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
              $project: {
                itemId: "$_id.id",
                title: "$_id.title",
                type: "product",
                count: 1,
              },
            },
          ],

          topClickedCategories: [
            { $match: { clickedType: "category", clickedItemId: { $ne: null } } },
            {
              $group: {
                _id: { id: "$clickedItemId", title: "$clickedTitle" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
            {
              $project: {
                itemId: "$_id.id",
                title: "$_id.title",
                type: "category",
                count: 1,
              },
            },
          ],

          // Top Users (Logged-in)
          topUsers: [
            { $match: { userId: { $ne: null } } },
            {
              $group: {
                _id: "$userId",
                totalSearches: { $sum: 1 },
                totalClicks: {
                  $sum: { $cond: [{ $ifNull: ["$clickedItemId", false] }, 1, 0] },
                },
              },
            },
            { $sort: { totalSearches: -1 } },
            { $limit: 10 },
          ],

          // Top Visitors
          topVisitors: [
            {
              $group: {
                _id: "$visitorId",
                totalSearches: { $sum: 1 },
                totalClicks: {
                  $sum: { $cond: [{ $ifNull: ["$clickedItemId", false] }, 1, 0] },
                },
              },
            },
            { $sort: { totalSearches: -1 } },
            { $limit: 10 },
          ],

          // Top 20 Searches Without Click
          topSearchesNoClick: [
            { $match: { clickedItemId: null } },
            {
              $group: {
                _id: {
                  $trim: { input: { $toLower: "$searchTerm" } },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
            {
              $project: {
                searchTerm: "$_id",
                count: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await SearchTrackings.aggregate(pipeline);
    const data = result[0];

    const totalStats = data.totalStats[0] || {
      totalSearches: 0,
      totalClicks: 0,
      uniqueLoggedInUsers: 0,
    };

    const guestData = data.guestSearches[0] || {
      totalGuestSearches: 0,
      guestClicks: 0,
    };

    const uniqueGuestVisitors = data.uniqueGuestVisitors[0]?.count || 0;

    return CustomResponse(res, 200, false, "Search analytics fetched successfully", {
      totalSearches: totalStats.totalSearches,
      totalClicks: totalStats.totalClicks,
      uniqueLoggedInUsers: totalStats.uniqueLoggedInUsers,
      uniqueGuestVisitors,
      totalGuestSearches: guestData.totalGuestSearches,

      topSearchTerms: data.topSearchTerms,
      topClickedThemes: data.topClickedThemes,
      topClickedProducts: data.topClickedProducts,
      topClickedCategories: data.topClickedCategories,

      topUsers: data.topUsers,
      topVisitors: data.topVisitors,
      topSearchesNoClick: data.topSearchesNoClick,
    });
  } catch (err) {
    console.error("Search Stats Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
