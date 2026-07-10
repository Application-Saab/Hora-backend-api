const mongoose = require("mongoose");

const userCitiesSchema = new mongoose.Schema(
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

    cityName: {
      type: String,
      trim: true,
      default: "",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

userCitiesSchema.pre("validate", function () {
  if (!this.userId && !this.visitorId) {
    throw new Error("Either userId or visitorId is required");
  }
});

module.exports = mongoose.model("user-cities", userCitiesSchema);
