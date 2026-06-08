const mongoose = require("mongoose");

const venuePackageCategoriesSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    categoriesStatus: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("venue-package-categories", venuePackageCategoriesSchema);
