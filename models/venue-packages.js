const mongoose = require("mongoose");

const venuePackagesSchema = new mongoose.Schema(
  {
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venues",
      required: true,
    },
    title: { type: String, trim: true, required: true },
    subTitle: { type: String, trim: true, required: true },
    discountedPrice: { type: Number, default: 0, min: 0 },
    actualPrice: { type: Number, min: 0, required: true },
    maxGuests: { type: Number, default: 0, min: 0 },
    tag: { type: String, default: "", trim: true },
    packageImageUrl: {
      type: String,
      default: "",
    },

    packageImageKey: {
      type: String,
      default: "",
    },
    packageItems: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "venue-package-items",
        },
      ],
      default: [],
    },
    packageAddons: [
      {
        type: String,
        trim: true,
      },
    ],
    packageStatus: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("venue-packages", venuePackagesSchema);
