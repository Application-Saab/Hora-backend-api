const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const EventDates = require("../models/event-dates");
const UserCities = require("../models/user-cities");
const { CustomResponse } = require("../store/commonFunction");

// Create new entry of event dates for a user or visitor
router.post("/", async (req, res) => {
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

    return CustomResponse(
      res,
      201,
      false,
      "Event dates entry created successfully",
      savedEntry,
    );
  } catch (err) {
    console.error("Create Event Dates Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Add New Event Date to Existing Entry
router.patch("/add-date", async (req, res) => {
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

    return CustomResponse(
      res,
      200,
      false,
      "Event date added successfully",
      updatedEntry,
    );
  } catch (err) {
    console.error("Add Event Date Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Get Event Dates, and city by userId or visitorId
router.get("/my-events", async (req, res) => {
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
    console.error("Fetch My Events Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Admin - Get All Event Dates with Pagination & Search
router.get("/list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const pipeline = [];

    // Every eventDate becomes a separate document
    pipeline.push({
      $unwind: {
        path: "$eventDates",
        preserveNullAndEmptyArrays: false,
      },
    });

    // Date Filter
    if (startDate || endDate) {
      const dateFilter = {};

      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      pipeline.push({
        $match: {
          "eventDates.date": dateFilter,
        },
      });
    }

    // User Lookup
    pipeline.push(
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
    );

    // Search
    if (search.trim()) {
      pipeline.push({
        $match: {
          $or: [
            {
              "user.name": {
                $regex: search,
                $options: "i",
              },
            },
            {
              "user.phone": {
                $regex: search,
                $options: "i",
              },
            },
            {
              pincode: {
                $regex: search,
                $options: "i",
              },
            },
            {
              "eventDates.eventTitle": {
                $regex: search,
                $options: "i",
              },
            },
          ],
        },
      });
    }

    // Total Count Pipeline
    const totalPipeline = [...pipeline, { $count: "total" }];

    const totalResult = await EventDates.aggregate(totalPipeline);

    const total = totalResult.length ? totalResult[0].total : 0;

    // Listing Pipeline
    pipeline.push(
      {
        $sort: {
          "eventDates.date": -1,
        },
      },
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
      {
        $skip: (pageNumber - 1) * limitNumber,
      },
      {
        $limit: limitNumber,
      },
    );

    const eventList = await EventDates.aggregate(pipeline);

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
          totalPages: Math.ceil(total / limitNumber),
        },
      },
    );
  } catch (err) {
    console.error("Fetch Event Dates List Error:", err);

    return CustomResponse(res, 500, true, "Server error");
  }
});

// Create / Update User City
router.post("/user-city", async (req, res) => {
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
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
});

// Link visitor history with logged-in user for event date
router.patch("/assign-user-event-date", async (req, res) => {
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
  } catch (err) {
    console.error("Assign User Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

// Link visitor history with logged-in user for user city
router.patch("/assign-user-city", async (req, res) => {
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
  } catch (err) {
    console.error("Assign User Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.get("/city-tracking-list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      cityName = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const match = {};

    if (cityName) {
      match.cityName = { $regex: cityName, $options: "i" };
    }

    if (startDate || endDate) {
      match.createdAt = {};

      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // poora din include hoga
        match.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: match },

      // User lookup
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

      // Visitor search lookup (ONLY when visitorId exists)
      {
        $lookup: {
          from: "search-trackings",
          let: { visitorId: "$visitorId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$visitorId", null] },
                    { $ne: ["$$visitorId", ""] },
                    { $eq: ["$visitorId", "$$visitorId"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "searchByVisitor",
        },
      },

      // User search lookup (ONLY when userId exists)
      {
        $lookup: {
          from: "search-trackings",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$userId", null] },
                    { $eq: ["$userId", "$$userId"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "searchByUser",
        },
      },

      // Final boolean
      {
        $addFields: {
          isSearchedAnything: {
            $or: [
              {
                $gt: [{ $size: { $ifNull: ["$searchByVisitor", []] } }, 0],
              },
              {
                $gt: [{ $size: { $ifNull: ["$searchByUser", []] } }, 0],
              },
            ],
          },
        },
      },
    ];

    // Search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.name": { $regex: search, $options: "i" } },
            { "user.phone": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Final projection + pagination
    pipeline.push(
      {
        $project: {
          _id: 1,
          cityName: 1,
          visitorId: 1,
          createdAt: 1,
          updatedAt: 1,
          isSearchedAnything: 1,

          user: {
            _id: "$user._id",
            name: "$user.name",
            phone: "$user.phone",
          },

          // Debug
          debug_visitorCount: {
            $size: { $ifNull: ["$searchByVisitor", []] },
          },
          debug_userCount: {
            $size: { $ifNull: ["$searchByUser", []] },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    );

    const cityList = await UserCities.aggregate(pipeline);

    // Total count
    const totalPipeline = [...pipeline.slice(0, -4), { $count: "total" }];

    const totalResult = await UserCities.aggregate(totalPipeline);
    const total = totalResult.length ? totalResult[0].total : 0;

    return CustomResponse(
      res,
      200,
      false,
      "City tracking fetched successfully",
      {
        cityList,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    );
  } catch (err) {
    console.error("Fetch City Tracking Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});
module.exports = router;
