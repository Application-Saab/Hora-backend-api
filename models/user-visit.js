const mongoose = require("mongoose");

const userVisitSchema = new mongoose.Schema({
  visitorId: { type: String, required: true },

  visitDate: { type: Date, required: true }, // start of day

  device: String,
  os: String,
  browser: String,

  pages: [String], // store visited pages

  pageViews: {
    type: Number,
    default: 1
  }

}, { timestamps: true });

module.exports = mongoose.model("userVisit", userVisitSchema);