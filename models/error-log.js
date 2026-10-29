const mongoose = require('mongoose');
const errorLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ["frontend", "api", "server", "performance"],
    required: true,
  },
  message: { type: String, required: true },
  stack: String,
  page: String,
  component: String,
  url: String,
  userId: String,
  visitorId: String,
  browser: String,
  device: String,
  payload: Object,
  statusCode: Number,
  endpoint: String,
});

// Indexes
errorLogSchema.index({ timestamp: -1 });
errorLogSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model("error-log", errorLogSchema);