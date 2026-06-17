const mongoose = require("mongoose");

const venueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    // venueType: { type: String, default: "" },
    venueType: { type: [String], default: [] },
    venueName: { type: String, default: "" },
    location: { type: String, default: "" },
    city: { type: String, default: "" },
    locality: { type: String, default: "" },
    googleMapLink: { type: String, default: "" },
    venueImageUrl: { type: String, default: "" },
    venueImageKey: { type: String, default: "" },
    eventTypes: { type: [String], default: [] }, // e.g., wedding, birthday, corporate
    guestCapacity: { type: Number, default: 0 },
    isParkingAvailable: { type: Boolean, default: false },
    hallType: { type: [String], default: [] }, // e.g., Outdoor, indoor
    foodTypes: { type: [String], default: [] }, // e.g., veg, non-veg, mixed
    startingPrice: { type: Number, default: 0 },
    totalRoomsAvailable: { type: Number, default: 0 },
    termsAndConditionsHtml: { type: String, default: "" },
    venueStatus: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,

    subFolders: [
      {
        folderName: {
          type: String,
          required: true,
          trim: true,
        },

        category: {
          type: String,
          default: "custom",
        },

        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Users",
          required: true,
        },

        folderDp: {
          fileUrl: String,
          thumbnailUrl: String,
          s3Key: String,
          thumbnailKey: String,
        },

        imageCount: {
          type: Number,
          default: 0,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("Venues", venueSchema);
