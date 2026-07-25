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
      default: "NOT_SELECTED",
      required: true,
    },
    searchCount : {
      type : Number,
      default : 0
    },
    eventDateCount : {
      type : Number,
      default : 0
    },
    clickCounts: {
      whatsapp : {
        type: Number,
        default : 0,
      },
      facebook : {
        type: Number,
        default : 0
      }
    }
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
