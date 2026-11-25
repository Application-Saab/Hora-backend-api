const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const EventDates = require("../models/event-dates");
const UserCities = require("../models/user-cities");
const SearchTrackings = require("../models/search-tracking");
const { CustomResponse } = require("../store/commonFunction");
const Users = require("../models/user") 

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// Update existing Event Date
router.patch("/update-date", async (req, res, next) => {
  try {
    const { userId, visitorId, eventId, date, eventTitle } = req.body;

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

    let query = {};
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId",
        });
      }
      query.userId = new mongoose.Types.ObjectId(userId);
    } else {
      query.visitorId = visitorId;
    }

    let updateQuery = {};

    // Case A: Agar frontend se specific subdocument eventId mila hai
    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      query["eventDates._id"] = new mongoose.Types.ObjectId(eventId);
      updateQuery = {
        $set: {
          "eventDates.$.date": eventDate,
          ...(eventTitle !== undefined && {
            "eventDates.$.eventTitle": eventTitle || "",
          }),
        },
      };
    } else {
      // Case B: Fallback agar eventId nahi mila, to array ke last item ko update karein
      // (MongoDB arrayFilters or fallback logic)
      const doc = await EventDates.findOne(query);
      if (!doc || !doc.eventDates?.length) {
        return CustomResponse(res, 404, true, "No event found to update");
      }
      const lastIndex = doc.eventDates.length - 1;
      query["_id"] = doc._id;
      updateQuery = {
        $set: {
          [`eventDates.${lastIndex}.date`]: eventDate,
          ...(eventTitle !== undefined && {
            [`eventDates.${lastIndex}.eventTitle`]: eventTitle || "",
          }),
        },
      };
    }

    const updatedEntry = await EventDates.findOneAndUpdate(query, updateQuery, {
      new: true,
    });

    if (!updatedEntry) {
      return CustomResponse(
        res,
        404,
        true,
        "No entry found matching the criteria",
      );
    }

    return CustomResponse(
      res,
      200,
      false,
      "Event date updated successfully",
      updatedEntry,
    );
  } catch (err) {
    console.error("Update Event Date Error:", err);
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
// Resolve matching User IDs first when `search` or `userSource` is active
const resolveFilteredUserIds = async (search = "", userSource = "") => {
  const trimmedSearch = search.trim();
  const hasSource = ["venue", "wonderland", "capsule"].includes(userSource);

  if (!trimmedSearch && !hasSource) {
    return null; // No user-level filter active
  }

  const userQuery = {};

  if (hasSource) {
    if (userSource === "venue") userQuery.fromVenue = true;
    if (userSource === "wonderland") userQuery.fromWonderland = true;
    if (userSource === "capsule") userQuery.fromCapsule = true;
  }

  if (trimmedSearch) {
    const escaped = escapeRegex(trimmedSearch);
    userQuery.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { phone: { $regex: escaped, $options: "i" } },
    ];
  }

  // Fetch only _id (uses covered/lean query)
  const users = await Users.find(userQuery).select("_id").lean();
  return users.map((u) => u._id);
};

//  Build base match query on UserCities
const buildMatch = ({
  cityName = "",
  startDate = "",
  endDate = "",
  searchedUsers = "",
  eventDateUsers = "",
  whatsappUsers = "",
  loggedInUsers = "",
  filteredUserIds = null,
}) => {
  const match = {};

  if (filteredUserIds !== null) {
    match.userId = { $in: filteredUserIds };
  } else if (String(loggedInUsers) === "true") {
    match.userId = { $ne: null };
    match.visitorId = { $nin: [null, ""] };
  }

  if (filteredUserIds !== null && String(loggedInUsers) === "true") {
    match.visitorId = { $nin: [null, ""] };
  }

  if (cityName && cityName.trim()) {
    match.cityName = cityName.trim();
  }

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      match.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  if (String(searchedUsers) === "true") {
    match.searchCount = { $gt: 0 };
  }

  if (String(eventDateUsers) === "true") {
    match.eventDateCount = { $gt: 0 };
  }

  if (String(whatsappUsers) === "true") {
    match["clickCounts.whatsapp"] = { $gt: 0 };
  }

  return match;
};

// City Tracking List
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
      userSource = "",
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (currentPage - 1) * perPage;

    const filteredUserIds = await resolveFilteredUserIds(search, userSource);

    if (filteredUserIds !== null && filteredUserIds.length === 0) {
      return CustomResponse(res, 200, false, "City tracking list fetched", {
        cityList: [],
        pagination: { total: 0, page: currentPage, limit: perPage, totalPages: 0 },
      });
    }

    const match = buildMatch({
      cityName,
      startDate,
      endDate,
      searchedUsers,
      eventDateUsers,
      whatsappUsers,
      loggedInUsers,
      filteredUserIds,
    });

    const collation = { locale: "en", strength: 2 };

    const [rawList, total] = await Promise.all([
      UserCities.find(match)
        .collation(collation)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Object.keys(match).length === 0
        ? UserCities.estimatedDocumentCount()
        : UserCities.countDocuments(match).collation(collation),
    ]);

    // Populate user details ONLY for the 10-50 rows on the current page
    const userIds = [
      ...new Set(rawList.map((item) => item.userId).filter(Boolean)),
    ];

    const usersMap = new Map();
    if (userIds.length > 0) {
      const users = await Users.find({ _id: { $in: userIds } })
        .select("_id name phone fromVenue fromWonderland fromCapsule")
        .lean();
      for (const u of users) {
        usersMap.set(String(u._id), u);
      }
    }

    const cityList = rawList.map((item) => {
      const u = item.userId ? usersMap.get(String(item.userId)) : null;
      return {
        _id: item._id,
        cityName: item.cityName,
        visitorId: item.visitorId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        searchCount: item.searchCount || 0,
        eventDateCount: item.eventDateCount || 0,
        clickCounts: item.clickCounts || {},
        user: u
          ? {
              _id: u._id,
              name: u.name,
              phone: u.phone,
              fromVenue: Boolean(u.fromVenue),
              fromWonderland: Boolean(u.fromWonderland),
              fromCapsule: Boolean(u.fromCapsule),
            }
          : null,
      };
    });

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

// City Tracking Stats 
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
      userSource = "",
    } = req.query;

    const filteredUserIds = await resolveFilteredUserIds(search, userSource);

    if (filteredUserIds !== null && filteredUserIds.length === 0) {
      return CustomResponse(res, 200, false, "City tracking stats fetched", {
        stats: {
          totalUsers: 0,
          totalSearchCount: 0,
          totalEventDateCount: 0,
          searchedUsers: 0,
          eventDateUsers: 0,
          whatsappUsers: 0,
          totalWhatsappClicks: 0,
          notSelectedUsers: 0,
          loggedInUsers: 0,
          venueUsers: 0,
          wonderlandUsers: 0,
          capsuleUsers: 0,
        },
      });
    }

    const match = buildMatch({
      cityName,
      startDate,
      endDate,
      searchedUsers,
      eventDateUsers,
      whatsappUsers,
      loggedInUsers,
      filteredUserIds,
    });

    const collation = { locale: "en", strength: 2 };

    // Fetch source user IDs in parallel using Users indexes
    const [venueIds, wonderlandIds, capsuleIds] = await Promise.all([
      userSource && userSource !== "venue"
        ? Promise.resolve([])
        : Users.find({ fromVenue: true }).distinct("_id"),
      userSource && userSource !== "wonderland"
        ? Promise.resolve([])
        : Users.find({ fromWonderland: true }).distinct("_id"),
      userSource && userSource !== "capsule"
        ? Promise.resolve([])
        : Users.find({ fromCapsule: true }).distinct("_id"),
    ]);

    // Pure aggregation on UserCities
    const [aggResult, venueUsers, wonderlandUsers, capsuleUsers] =
      await Promise.all([
        UserCities.aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              totalSearchCount: { $sum: { $ifNull: ["$searchCount", 0] } },
              totalEventDateCount: {
                $sum: { $ifNull: ["$eventDateCount", 0] },
              },
              searchedUsers: {
                $sum: {
                  $cond: [{ $gt: [{ $ifNull: ["$searchCount", 0] }, 0] }, 1, 0],
                },
              },
              eventDateUsers: {
                $sum: {
                  $cond: [
                    { $gt: [{ $ifNull: ["$eventDateCount", 0] }, 0] },
                    1,
                    0,
                  ],
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
          },
        ])
          .collation(collation)
          .allowDiskUse(true),

        venueIds.length
          ? UserCities.countDocuments({
              ...match,
              userId: {
                $in: filteredUserIds
                  ? venueIds.filter((id) =>
                      filteredUserIds.some((fid) => String(fid) === String(id))
                    )
                  : venueIds,
              },
            }).collation(collation)
          : 0,

        wonderlandIds.length
          ? UserCities.countDocuments({
              ...match,
              userId: {
                $in: filteredUserIds
                  ? wonderlandIds.filter((id) =>
                      filteredUserIds.some((fid) => String(fid) === String(id))
                    )
                  : wonderlandIds,
              },
            }).collation(collation)
          : 0,

        capsuleIds.length
          ? UserCities.countDocuments({
              ...match,
              userId: {
                $in: filteredUserIds
                  ? capsuleIds.filter((id) =>
                      filteredUserIds.some((fid) => String(fid) === String(id))
                    )
                  : capsuleIds,
              },
            }).collation(collation)
          : 0,
      ]);

    const finalStats = aggResult?.[0] || {};

    return CustomResponse(res, 200, false, "City tracking stats fetched", {
      stats: {
        totalUsers: finalStats.totalUsers || 0,
        totalSearchCount: finalStats.totalSearchCount || 0,
        totalEventDateCount: finalStats.totalEventDateCount || 0,
        searchedUsers: finalStats.searchedUsers || 0,
        eventDateUsers: finalStats.eventDateUsers || 0,
        whatsappUsers: finalStats.whatsappUsers || 0,
        totalWhatsappClicks: finalStats.totalWhatsappClicks || 0,
        notSelectedUsers: finalStats.notSelectedUsers || 0,
        loggedInUsers: finalStats.loggedInUsers || 0,
        venueUsers: venueUsers || 0,
        wonderlandUsers: wonderlandUsers || 0,
        capsuleUsers: capsuleUsers || 0,
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
