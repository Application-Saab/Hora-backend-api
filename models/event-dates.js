const mongoose = require("mongoose");

const eventDatesSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },

    visitorId: {
      type: String,
      default: null,
    },

    pincode: {
      type: String,
      trim: true,
      default: "",
    },

    eventDates: [
      {
        date: {
          type: String,
          required: true,
        },
        eventTitle: {
          type: String,
          trim: true,
          default: "",
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

eventDatesSchema.pre("validate", function () {
  if (!this.userId && !this.visitorId) {
    throw new Error("Either userId or visitorId is required");
  }
});

module.exports = mongoose.model("event-dates", eventDatesSchema);
