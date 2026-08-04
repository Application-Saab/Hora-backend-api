const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  type: { 
    type: String, 
    enum: ['frontend', 'api', 'server', "performance"], 
    required: true 
  },
  message: { type: String, required: true },
  stack: String,
  page: { type: String },
  component: String,        // e.g., "VenueList"
  url: String,              // page URL
  userId: String,
  visitorId: String,
  browser: String,
  device: String,
  payload: Object,          // extra data (axios response, etc.)
  statusCode: Number,
  endpoint: String,
});

module.exports = mongoose.model('error-log', errorLogSchema);
