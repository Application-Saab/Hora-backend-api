const mongoose = require("mongoose");

const reportedUserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
    reportedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const eventBadgeSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    title: { type: String, required: true, trim: true },
    createdBy: { type: String, required: true, trim: true },
    eventId: { type: String, ref: "eventInvites" },
    badgeNote: { type: String, trim: true },
    badgeImageUrl: { type: String, trim: true },
    isDisabled: { type: Boolean, default: false },
    reportedUserIds: [reportedUserSchema],
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("event-badges", eventBadgeSchema);
