const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const ErrorLog = require("../models/error-log");
const { CustomResponse } = require("../store/commonFunction");

// Save Error Logs
router.post("/", async (req, res) => {
  try {
    const errorData = {
      ...req.body,
      timestamp: new Date(),
    };
    await ErrorLog.create(errorData);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Failed to save error log:", err);
    res.status(500).json({ success: false });
  }
});

// Get Error Logs List
router.get("/list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      type = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const match = {};

    // Type filter
    if (type) {
      match.type = type;
    }

    // Date range filter
    if (startDate || endDate) {
      match.timestamp = {};

      if (startDate) {
        match.timestamp.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.timestamp.$lte = end;
      }
    }

    const pipeline = [
      {
        $match: match,
      },
    ];

    // Search
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            {
              message: {
                $regex: search,
                $options: "i",
              },
            },
            {
              stack: {
                $regex: search,
                $options: "i",
              },
            },
            {
              page: {
                $regex: search,
                $options: "i",
              },
            },
            {
              component: {
                $regex: search,
                $options: "i",
              },
            },
            {
              url: {
                $regex: search,
                $options: "i",
              },
            },
            {
              endpoint: {
                $regex: search,
                $options: "i",
              },
            },
            {
              browser: {
                $regex: search,
                $options: "i",
              },
            },
            {
              device: {
                $regex: search,
                $options: "i",
              },
            },
            {
              userId: {
                $regex: search,
                $options: "i",
              },
            },
            {
              visitorId: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        },
      });
    }

    pipeline.push(
      {
        $project: {
          _id: 1,
          timestamp: 1,
          type: 1,
          message: 1,
          stack: 1,
          page: 1,
          component: 1,
          url: 1,
          userId: 1,
          visitorId: 1,
          browser: 1,
          device: 1,
          payload: 1,
          statusCode: 1,
          endpoint: 1,
        },
      },
      {
        $sort: {
          timestamp: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: Number(limit),
      },
    );

    const errorLogs = await ErrorLog.aggregate(pipeline);

    // Total Count
    const totalPipeline = [...pipeline.slice(0, -3)];

    totalPipeline.push({
      $count: "total",
    });

    const totalResult = await ErrorLog.aggregate(totalPipeline);

    const total = totalResult.length ? totalResult[0].total : 0;

    return CustomResponse(res, 200, false, "Error logs fetched successfully", {
      errorLogs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("Fetch Error Logs Error:", err);
    return CustomResponse(res, 500, true, "Server error");
  }
});

const globalErrorHandler = (err, req, res, next) => {
  console.error(err);

  ErrorLog.create({
    type: "server",
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    statusCode: res.statusCode || 500,
    endpoint: req.method + " " + req.originalUrl,
  });

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    errorId: Date.now(), // for tracking
  });
};

module.exports = { router, globalErrorHandler };
