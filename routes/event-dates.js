const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const EventDates = require("../models/event-dates");
const { CustomResponse } = require("../store/commonFunction");

// ==================== 1. Create New Entry ====================
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

    const newEntry = new EventDates({
      userId: userId || null,
      visitorId: visitorId || null,
      pincode: pincode || "",
      eventDates: [
        {
          date,
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

// ==================== 2. Add New Event Date to Existing Entry ====================
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

    const query = userId
      ? { userId: new mongoose.Types.ObjectId(userId) }
      : { visitorId };

    const updatedEntry = await EventDates.findOneAndUpdate(
      query,
      {
        $push: {
          eventDates: {
            date,
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

// ==================== 3. Get Event Dates by userId or visitorId ====================
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

    const events = await EventDates.findOne(query)
      .populate("userId", "name phone")
      .lean();

    if (!events) {
      return CustomResponse(res, 200, false, "No events found", {
        eventDates: [],
      });
    }

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

// ==================== 4. Admin - Get All Event Dates with Pagination & Search ====================
router.get("/list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const pipeline = [];

    // Date Filter on individual eventDates
    if (startDate || endDate) {
      const dateConditions = [];

      if (startDate) {
        dateConditions.push({ "eventDates.date": { $gte: startDate } });
      }
      if (endDate) {
        dateConditions.push({ "eventDates.date": { $lte: endDate } });
      }

      pipeline.push({
        $match: { $and: dateConditions },
      });
    }

    // Unwind eventDates array → Har date alag object banega
    pipeline.push({
      $unwind: {
        path: "$eventDates",
        preserveNullAndEmptyArrays: false,   // empty wale exclude
      },
    });

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
      }
    );

    // Search Filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.phone": { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } },
            { pincode: { $regex: search, $options: "i" } },
            { "eventDates.eventTitle": { $regex: search, $options: "i" } },
            { "eventDates.date": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Final Projection
    pipeline.push(
      {
        $project: {
          _id: 1,
          userId: 1,
          visitorId: 1,
          pincode: 1,
          date: "$eventDates.date",
          eventTitle: "$eventDates.eventTitle",
          createdAt: 1,
          updatedAt: 1,
          user: {
            _id: "$user._id",
            name: "$user.name",
            phone: "$user.phone",
          },
        },
      },
      { $sort: { "eventDates.date": -1 } },   // date ke hisab se sort
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    );

    const eventList = await EventDates.aggregate(pipeline);

    // Total Count
    const totalPipeline = pipeline.slice(0, pipeline.length - 3); // remove skip & limit
    totalPipeline.push({ $count: "total" });

    const totalResult = await EventDates.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    return CustomResponse(res, 200, false, "Event dates list fetched successfully", {
      eventList,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("Fetch Event Dates List Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
