const mongoose = require("mongoose");

const heroImageConfigSchema = new mongoose.Schema(
  {
    cropSize: {
      height: { type: Number, default: 200 },
      width: { type: Number, default: 200 },
    },
    cropRatio: {
      height: { type: Number, default: 3 },
      width: { type: Number, default: 4 },
    },
    cropShape: { type: String, default: "rect" },
  },
  { _id: false }
);

const charLimitsSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const configSchema = new mongoose.Schema(
  {
    templateId: { type: String, default: "" },
    fontUrls: { type: [String], default: [] },
    cssCode: { type: String, default: "" },
    jsCode: { type: String, default: "" },
    bgImageName: { type: String, default: "" },
    dateFormatCase: { type: String, default: "" },
    charLimits: { type: charLimitsSchema, default: () => ({}) },
    heroImageConfig: { type: heroImageConfigSchema, default: () => ({}) },
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema({
  fileName: { type: String, default: "" },
  webpUrl: { type: String, default: "" },
  s3WebpKey: { type: String, default: "" },
  isHeroImage: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  category: { type: String, required: true, trim: true },
  configs: { type: configSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EventTemplate", templateSchema);
