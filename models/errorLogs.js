const mongoose = require("mongoose");

const errorLogSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ErrorLogs", errorLogSchema);