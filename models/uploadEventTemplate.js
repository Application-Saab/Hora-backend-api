const mongoose = require("mongoose");

const configSchema = new mongoose.Schema(
  {},
  {
    _id: false,
    strict: false,
  }
);

const templateSchema = new mongoose.Schema({
  fileName: { type: String, default: "" },
  webpUrl: { type: String, default: "" },
  s3WebpKey: { type: String, default: "" },
  isHeroImage: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  category: { type: String, required: true, trim: true },

  // Now config accepts ANYTHING
  configs: { type: configSchema, default: () => ({}) },

  createdAt: { type: Date, default: Date.now },
  templateSize: { type: String, default: "big" },
});

module.exports = mongoose.model("EventTemplate", templateSchema);
