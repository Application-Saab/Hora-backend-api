const mongoose = require("mongoose");

const venueSuggestionSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      trim: true, 
      default: "" 
    },
    metaData: { 
      type: mongoose.Schema.Types.Mixed, 
      default: {} 
    },
    dataType: {
      type: String,
      enum: ["FAQ", "SPECIAL_FEATURES"],
      default: "FAQ",
    },
    status: {
      type: Number,
      enum: [1, 2, 3], // 1: active, 2: inactive, 3: deleted
      default: 1,
    },
  },
  {
    strict: false,
    timestamps: true,
  }
);

// fast filtering ke liye index
venueSuggestionSchema.index({ dataType: 1, status: 1 });

module.exports = mongoose.model("VenueSuggestion", venueSuggestionSchema, "venue-suggestions");