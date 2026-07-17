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
