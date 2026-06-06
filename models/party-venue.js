const mongoose = require("mongoose");

const venueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    venueType: { type: String, default: "" },
    venueName: { type: String, default: "" },
    location: { type: String, default: "" },
    googleMapLink: { type: String, default: "" },
    venueImageUrl: {
      type: String,
      default: "",
    },

    venueImageKey: {
      type: String,
      default: "",
    },
    termsAndConditionsHtml: {
      type: String,
      default: "",
    },
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
