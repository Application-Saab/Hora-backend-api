const mongoose = require("mongoose");

const capsuleDailyClicks = new mongoose.Schema(
  {
    mainFolderId: {
      type: String,
      ref: "Folder", 
      required: true,
      index: true,
    },
    date: {
      type: String, 
      required: true,
      index: true,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
  },
  { 
    timestamps: true 
  }
);

capsuleDailyClicks.index({ mainFolderId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("capsuleDailyClicks", capsuleDailyClicks);