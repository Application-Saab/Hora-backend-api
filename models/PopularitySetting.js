const mongoose = require("mongoose");

const popularitySettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "" },
    value: { type: String, default: "" },
  },
  {
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("PopularitySetting", popularitySettingSchema);
