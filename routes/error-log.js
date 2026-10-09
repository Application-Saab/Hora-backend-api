const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const ErrorLog = require("../models/error-log");
const { CustomResponse } = require("../store/commonFunction");

// Save Error Logs
router.post("/", async (req, res, next) => {
  try {
    const errorData = {
      ...req.body,
      timestamp: new Date(),
    };
    await ErrorLog.create(errorData);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/list", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      type = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const skip = (currentPage - 1) * perPage;

    const filter = {};

    if (type) {
      filter.type = type;
    }

    if (startDate || endDate) {
      filter.timestamp = {};

      if (startDate) {
        const start = new Date(startDate);

        if (!Number.isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          filter.timestamp.$gte = start;
        }
      }

      if (endDate) {
        const end = new Date(endDate);

        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          filter.timestamp.$lte = end;
        }
      }

      if (Object.keys(filter.timestamp).length === 0) {
        delete filter.timestamp;
      }
    }

    if (search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { message: { $regex: escapedSearch, $options: "i" } },
        { stack: { $regex: escapedSearch, $options: "i" } },
        { page: { $regex: escapedSearch, $options: "i" } },
        { component: { $regex: escapedSearch, $options: "i" } },
        { url: { $regex: escapedSearch, $options: "i" } },
        { endpoint: { $regex: escapedSearch, $options: "i" } },
        { browser: { $regex: escapedSearch, $options: "i" } },
        { device: { $regex: escapedSearch, $options: "i" } },
        { userId: { $regex: escapedSearch, $options: "i" } },
        { visitorId: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    
    const [errorLogs, total] = await Promise.all([
      ErrorLog.find(filter)
        .select({
          _id: 1,
          timestamp: 1,
          type: 1,
          message: 1,
          page: 1,
          component: 1,
          url: 1,
          userId: 1,
          visitorId: 1,
          browser: 1,
          device: 1,
          statusCode: 1,
          endpoint: 1,
        })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      ErrorLog.countDocuments(filter),
    ]);

    return CustomResponse(res, 200, false, "Error logs fetched successfully", {
      errorLogs,
      pagination: {
        total,
        page: currentPage,
        limit: perPage,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (err) {
    next(err);
  }
});

const globalErrorHandler = async (err, req, res, next) => {
  console.error(err);

  try {
    await ErrorLog.create({
      type: "server",
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      endpoint: `${req.method} ${req.originalUrl}`,
      statusCode: err.status || 500,
    });
  } catch (e) {
    console.error("Unable to save error", e);
  }

  return CustomResponse(
    res,
    err.status || 500,
    true,
    err.isPublic ? err.message : "Internal Server Error",
  );
};

module.exports = { router, globalErrorHandler };
