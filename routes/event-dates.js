const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const EventDates = require("../models/event-dates");
const UserCities = require("../models/user-cities");
const SearchTrackings = require("../models/search-tracking");
const { CustomResponse } = require("../store/commonFunction");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatch({
  cityName,
  startDate,
  endDate,
  searchedUsers,
  eventDateUsers,
  whatsappUsers,
  loggedInUsers,
}) {
  const match = {};

  if (cityName?.trim()) {
    match.cityName = {
      $regex: escapeRegex(cityName.trim()),
      $options: "i",
    };
  }

  if (searchedUsers === "true") {
    match.searchCount = { $gt: 0 };
  }

  if (eventDateUsers === "true") {
    match.eventDateCount = { $gt: 0 };
  }

  if (whatsappUsers === "true") {
    match["clickCounts.whatsapp"] = { $gt: 0 };
  }

  if (startDate || endDate) {
    match.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        match.createdAt.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    if (Object.keys(match.createdAt).length === 0) {
      delete match.createdAt;
    }
  }

  if (loggedInUsers === "true") {
    match.userId = { $ne: null };
    match.visitorId = { $ne: null };
  }

  return match;
}

// Create new entry of event dates for a user or visitor
router.post("/", async (req, res, next) => {
  try {
    const { userId, visitorId, pincode, date, eventTitle } = req.body;

    // Priority: userId > visitorId
    if (!userId && !visitorId) {
      return CustomResponse(
        res,
        400,
        true,
        "Either userId or visitorId is required",
      );
    }

    if (!date) {
      return CustomResponse(res, 400, true, "date is required");
    }

    if (isNaN(new Date(date).getTime())) {
      return CustomResponse(res, 400, true, "Invalid date format");
    }

    const eventDate = new Date(date);
    eventDate.setUTCHours(0, 0, 0, 0);

    const newEntry = new EventDates({
      userId: userId || null,
      visitorId: visitorId || null,
      pincode: pincode || "",
      eventDates: [
        {
          date: eventDate,
          eventTitle: eventTitle || "",
        },
      ],
    });

    const savedEntry = await newEntry.save();

    let filter = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      filter = { userId };
    } else if (visitorId) {
      filter = { visitorId };
    } else {
      return res.status(400).json({
        success: false,
        message: "Either userId or visitorId is required",
      });
    }

    await UserCities.findOneAndUpdate(filter, {
      $inc: {
        eventDateCount: 1,
      },
    });

    return CustomResponse(
      res,
      201,
      false,
      "Event dates entry created successfully",
      savedEntry,
    );
  } catch (err) {
    console.error("Create Event Dates Error:", err);
    err.isPublic = true;
    next(err);
  }
});

// Add New Event Date to Existing Entry
router.patch("/add-date", async (req, res, next) => {
  try {
    const { userId, visitorId, date, eventTitle } = req.body;

    if (!date) {
      return CustomResponse(res, 400, true, "date is required");
    }

    if (!userId && !visitorId) {
      return CustomResponse(
        res,
        400,
        true,
        "Either userId or visitorId is required",
      );
    }

    if (isNaN(new Date(date).getTime())) {
      return CustomResponse(res, 400, true, "Invalid date format");
    }

    const eventDate = new Date(date);
    eventDate.setUTCHours(0, 0, 0, 0);

    const query = userId
      ? { userId: new mongoose.Types.ObjectId(userId) }
      : { visitorId };

    const updatedEntry = await EventDates.findOneAndUpdate(
      query,
      {
        $push: {
          eventDates: {
            date: eventDate,
            eventTitle: eventTitle || "",
          },
        },
      },
      { new: true },
    );

    if (!updatedEntry) {
      return CustomResponse(
        res,
        404,
        true,
        "No entry found for this user/visitor",
      );
    }

    let filter = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      filter = { userId };
    } else if (visitorId) {
      filter = { visitorId };
    } else {
      return res.status(400).json({
        success: false,
        message: "Either userId or visitorId is required",
      });
    }

    await UserCities.findOneAndUpdate(filter, {
      $inc: {
        eventDateCount: 1,
      },
    });

    return CustomResponse(
      res,
      200,
      false,
      "Event date added successfully",
      updatedEntry,
    );
  } catch (err) {
    console.error("Add Event Date Error:", err);
    err.isPublic = true;
    next(err);
  }
});

// Get Event Dates, and city by userId or visitorId
router.get("/my-events", async (req, res, next) => {
  try {
    const { userId, visitorId } = req.query;

    if (!userId && !visitorId) {
      return CustomResponse(
        res,
        400,
        true,
        "Either userId or visitorId is required",
      );
    }

    const query = userId ? { userId } : { visitorId };

    // Fetch both in parallel
    const [events, cityData] = await Promise.all([
      EventDates.findOne(query).populate("userId", "name phone").lean(),

      UserCities.findOne(query).lean(),
    ]);

    if (!events) {
      return CustomResponse(res, 200, false, "No events found", {
        eventDates: [],
        cityName: cityData?.cityName || "",
      });
    }

    // Add cityName in response
    events.cityName = cityData?.cityName || "";

    return CustomResponse(
      res,
      200,
      false,
      "Events fetched successfully",
      events,
    );
  } catch (err) {
    error.isPublic = true;
    next(error);
  }
});

// Admin - Get All Event Dates with Pagination & Search
router.get("/list", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const pipeline = [];

    // Every eventDate becomes a separate document
    pipeline.push({
      $unwind: {
        path: "$eventDates",
        preserveNullAndEmptyArrays: false,
      },
    });

    // Date filter
    if (startDate || endDate) {
      const dateFilter = {};

      if (startDate) {
        const start = new Date(startDate);
        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          dateFilter.$gte = start;
        }
      }

      if (endDate) {
        const end = new Date(endDate);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          dateFilter.$lte = end;
        }
      }

      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({
          $match: {
            "eventDates.date": dateFilter,
          },
        });
      }
    }

    const hasSearch = search.trim().length > 0;
    const escapedSearch = hasSearch
      ? search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "";

    // lookup + search match
    if (hasSearch) {
      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                  phone: 1,
                },
              },
            ],
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            $or: [
              { "user.name": { $regex: escapedSearch, $options: "i" } },
              { "user.phone": { $regex: escapedSearch, $options: "i" } },
              { pincode: { $regex: escapedSearch, $options: "i" } },
              {
                "eventDates.eventTitle": {
                  $regex: escapedSearch,
                  $options: "i",
                },
              },
            ],
          },
        },
      );
    }

    // Single aggregation with $facet (list + total together)
    pipeline.push({
      $facet: {
        list: [
          { $sort: { "eventDates.date": -1, updatedAt: -1 } },
          { $skip: skip },
          { $limit: limitNumber },

          // Lookup only for the final page when no search was done
          ...(!hasSearch
            ? [
                {
                  $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    pipeline: [
                      {
                        $project: {
                          _id: 1,
                          name: 1,
                          phone: 1,
                        },
                      },
                    ],
                    as: "user",
                  },
                },
                {
                  $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: true,
                  },
                },
              ]
            : []),

          {
            $project: {
              _id: 1,
              userId: 1,
              visitorId: 1,
              pincode: 1,
              createdAt: 1,
              updatedAt: 1,
              date: "$eventDates.date",
              eventTitle: "$eventDates.eventTitle",
              user: {
                _id: "$user._id",
                name: "$user.name",
                phone: "$user.phone",
              },
            },
          },
        ],

        total: [{ $count: "count" }],
      },
    });

    const [result] = await EventDates.aggregate(pipeline).allowDiskUse(true);

    const eventList = result?.list || [];
    const total = result?.total?.[0]?.count || 0;

    return CustomResponse(
      res,
      200,
      false,
      "Event dates list fetched successfully",
      {
        eventList,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber) || 1,
        },
      },
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});
// Create / Update User City
router.post("/user-city", async (req, res, next) => {
  try {
    const { userId, visitorId, cityName } = req.body;

    if (!cityName || !cityName.trim()) {
      return res.status(400).json({
        success: false,
        message: "cityName is required",
      });
    }

    let filter = {};

    // Priority to userId
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      filter = {
        userId,
      };
    }
    // If userId not present then use visitorId
    else if (visitorId) {
      filter = {
        visitorId,
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Either userId or visitorId is required",
      });
    }

    const city = await UserCities.findOneAndUpdate(
      filter,
      {
        $set: {
          cityName: cityName.trim(),
          userId: userId || null,
          visitorId: visitorId || null,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "City saved successfully",
      data: city,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Link visitor history with logged-in user for event date
router.patch("/assign-user-event-date", async (req, res, next) => {
  try {
    const { visitorId, userId } = req.body;

    if (!visitorId) {
      return CustomResponse(res, 400, true, "visitorId is required");
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return CustomResponse(res, 400, true, "Valid userId is required");
    }

    const result = await EventDates.updateMany(
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
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Link visitor history with logged-in user for user city
router.patch("/assign-user-city", async (req, res, next) => {
  try {
    const { visitorId, userId } = req.body;

    if (!visitorId) {
      return CustomResponse(res, 400, true, "visitorId is required");
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return CustomResponse(res, 400, true, "Valid userId is required");
    }

    const result = await UserCities.updateMany(
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
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// City tracking list API
router.get("/city-tracking-list", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      cityName = "",
      startDate = "",
      endDate = "",
      searchedUsers = "",
      eventDateUsers = "",
      whatsappUsers = "",
      loggedInUsers = "",
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (currentPage - 1) * perPage;

    const match = buildMatch({
      cityName,
      startDate,
      endDate,
      searchedUsers,
      eventDateUsers,
      whatsappUsers,
      loggedInUsers,
    });

    const pipeline = [{ $match: match }];

    const hasSearch = search.trim().length > 0;
    if (hasSearch) {
      const escapedSearch = escapeRegex(search.trim());

      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, name: 1, phone: 1 } }],
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            $or: [
              { "user.name": { $regex: escapedSearch, $options: "i" } },
              { "user.phone": { $regex: escapedSearch, $options: "i" } },
            ],
          },
        },
      );
    }

    pipeline.push({
      $facet: {
        list: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: perPage },
          ...(!hasSearch
            ? [
                {
                  $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    pipeline: [{ $project: { _id: 1, name: 1, phone: 1 } }],
                    as: "user",
                  },
                },
                {
                  $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: true,
                  },
                },
              ]
            : []),

          {
            $project: {
              _id: 1,
              cityName: 1,
              visitorId: 1,
              createdAt: 1,
              updatedAt: 1,
              searchCount: { $ifNull: ["$searchCount", 0] },
              eventDateCount: { $ifNull: ["$eventDateCount", 0] },
              clickCounts: { $ifNull: ["$clickCounts", {}] },
              user: {
                _id: "$user._id",
                name: "$user.name",
                phone: "$user.phone",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const [result] = await UserCities.aggregate(pipeline).allowDiskUse(true);

    const cityList = result?.list || [];
    const total = result?.total?.[0]?.count || 0;

    return CustomResponse(res, 200, false, "City tracking list fetched", {
      cityList,
      pagination: {
        total,
        page: currentPage,
        limit: perPage,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// City tracking stats
router.get("/city-tracking-stats", async (req, res, next) => {
  try {
    const {
      search = "",
      cityName = "",
      startDate = "",
      endDate = "",
      searchedUsers = "",
      eventDateUsers = "",
      whatsappUsers = "",
      loggedInUsers = "",
    } = req.query;

    const match = buildMatch({
      cityName,
      startDate,
      endDate,
      searchedUsers,
      eventDateUsers,
      whatsappUsers,
      loggedInUsers,
    });

    const pipeline = [{ $match: match }];
    const hasSearch = search.trim().length > 0;
    if (hasSearch) {
      const escapedSearch = escapeRegex(search.trim());

      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, name: 1, phone: 1 } }],
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            $or: [
              { "user.name": { $regex: escapedSearch, $options: "i" } },
              { "user.phone": { $regex: escapedSearch, $options: "i" } },
            ],
          },
        },
      );
    }

    pipeline.push({
      $group: {
        _id: null,
        totalSearchCount: { $sum: { $ifNull: ["$searchCount", 0] } },
        totalEventDateCount: { $sum: { $ifNull: ["$eventDateCount", 0] } },
        searchedUsers: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$searchCount", 0] }, 0] }, 1, 0],
          },
        },
        eventDateUsers: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$eventDateCount", 0] }, 0] }, 1, 0],
          },
        },
        whatsappUsers: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ["$clickCounts.whatsapp", 0] }, 0] },
              1,
              0,
            ],
          },
        },
        totalWhatsappClicks: {
          $sum: { $ifNull: ["$clickCounts.whatsapp", 0] },
        },
        notSelectedUsers: {
          $sum: {
            $cond: [{ $eq: ["$cityName", "NOT_SELECTED"] }, 1, 0],
          },
        },
        loggedInUsers: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$userId", null] },
                  { $ne: ["$visitorId", null] },
                  { $ne: ["$visitorId", ""] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    });

    const [stats] = await UserCities.aggregate(pipeline).allowDiskUse(true);

    const finalStats = stats || {
      totalSearchCount: 0,
      totalEventDateCount: 0,
      searchedUsers: 0,
      eventDateUsers: 0,
      whatsappUsers: 0,
      totalWhatsappClicks: 0,
      notSelectedUsers: 0,
      loggedInUsers: 0,
    };

    return CustomResponse(res, 200, false, "City tracking stats fetched", {
      stats: {
        totalSearchCount: finalStats.totalSearchCount || 0,
        totalEventDateCount: finalStats.totalEventDateCount || 0,
        searchedUsers: finalStats.searchedUsers || 0,
        eventDateUsers: finalStats.eventDateUsers || 0,
        whatsappUsers: finalStats.whatsappUsers || 0,
        totalWhatsappClicks: finalStats.totalWhatsappClicks || 0,
        notSelectedUsers: finalStats.notSelectedUsers || 0,
        loggedInUsers: finalStats.loggedInUsers || 0,
      },
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Track whatsapp click counts from website
router.patch("/user-city/click-count", async (req, res, next) => {
  try {
    const { userId, visitorId, type } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "type is required",
      });
    }

    const allowedTypes = ["whatsapp", "facebook"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid click type",
      });
    }

    let filter = {};

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }

      filter = { userId };
    } else if (visitorId) {
      filter = { visitorId };
    } else {
      return res.status(400).json({
        success: false,
        message: "Either userId or visitorId is required",
      });
    }

    const updatedCity = await UserCities.findOneAndUpdate(
      filter,
      {
        $inc: {
          [`clickCounts.${type}`]: 1,
        },
      },
      {
        new: true,
      },
    );

    if (!updatedCity) {
      return res.status(404).json({
        success: false,
        message: "User city not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `${type} click count updated successfully`,
      data: {},
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Assing user to city, event date, and search tracking
router.patch("/assign-user-history", async (req, res, next) => {
  try {
    const { visitorId, userId } = req.body;

    if (!visitorId) {
      return CustomResponse(res, 400, true, "visitorId is required");
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return CustomResponse(res, 400, true, "Valid userId is required");
    }

    const filter = {
      visitorId,
      $or: [{ userId: { $exists: false } }, { userId: null }],
    };

    const update = {
      $set: {
        userId,
      },
    };

    const [searchTrackingResult, eventDateResult, userCityResult] =
      await Promise.all([
        SearchTrackings.updateMany(filter, update),
        EventDates.updateMany(filter, update),
        UserCities.updateMany(filter, update),
      ]);

    return CustomResponse(
      res,
      200,
      false,
      "Visitor history linked successfully",
      {
        searchTracking: {
          matchedCount: searchTrackingResult.matchedCount,
          modifiedCount: searchTrackingResult.modifiedCount,
        },
        eventDates: {
          matchedCount: eventDateResult.matchedCount,
          modifiedCount: eventDateResult.modifiedCount,
        },
        userCities: {
          matchedCount: userCityResult.matchedCount,
          modifiedCount: userCityResult.modifiedCount,
        },
      },
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

module.exports = router;
