const mongoose = require("mongoose");

const venueVisitorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venues",
      required: true
    }
  },
  {
    timestamps: true
  }
);

// prevent duplicate registration
venueVisitorSchema.index({ userId: 1, venueId: 1 }, { unique: true });

module.exports = mongoose.model("VenueVisitors", venueVisitorSchema);