const mongoose = require("mongoose");

const searchTrackingSchema = new mongoose.Schema(
  {
    searchTerm: {
      type: String,
      required: true,
      trim: true,
    },

    clickedItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    clickedTitle: {
      type: String,
      trim: true,
    },
    pageName : {
      type: String,
      trim: true,
    },

    clickedType: {
      type: String,
      //   required: true,
      enum: ["theme", "product", "category", "other", ""],
      default: "",
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },

    visitorId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

searchTrackingSchema.pre("validate", function () {
  if (!this.userId && !this.visitorId) {
    throw new Error("Either userId or visitorId is required");
  }
});

searchTrackingSchema.index({ createdAt: -1 });
searchTrackingSchema.index({ clickedType: 1, createdAt: -1 });
searchTrackingSchema.index({ searchTerm: 1 });
searchTrackingSchema.index({ clickedTitle: 1 });
searchTrackingSchema.index({ userId: 1, createdAt: -1 });
searchTrackingSchema.index({ visitorId: 1, createdAt: -1 });
searchTrackingSchema.index({ clickedItemId: 1, clickedType: 1 });
searchTrackingSchema.index({ "clickedItemId": 1, createdAt: -1 });

module.exports = mongoose.model("search-tracking", searchTrackingSchema);
