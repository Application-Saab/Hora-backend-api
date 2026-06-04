const mongoose = require("mongoose");

const venuePackageItemsSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    foodType: {
      type: String,
      enum: ["veg", "non-veg", "mixed"],
      default: "",
    },
    categoryIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "venue-package-categories",
        },
      ],
      default: [],
    },
    itemsStatus: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("venue-package-items", venuePackageItemsSchema);
