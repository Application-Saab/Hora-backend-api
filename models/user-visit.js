const mongoose = require("mongoose");

const userVisitSchema = new mongoose.Schema({
  visitorId: String,
  visitDate: Date, // start of day
  device: String,
  os: String,
  browser: String,
  page: String, // 👈 add this
});

module.exports = mongoose.model("userVisit", userVisitSchema);
