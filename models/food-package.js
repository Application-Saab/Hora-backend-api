const mongoose = require("mongoose");

const foodPackageSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", required: true },
    image: { type: String, default: "", required: true },
    price: { type: Number, default: 0, required: true },
    actualPrice: { type: Number, default: 0, required: true },
    foodType: {
      type: String,
      enum: ["veg", "non-veg", "mixed"],
      default: "",
      required: true,
    },
    packageType: {
      type: String,
      enum: ["bulkFood", "liveCatering"],
      default: "",
      required: true,
    },
    packageItems: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "dish",
        },
      ],
      default: [],
    },
    packageStatus: {
      type: Number,
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("food-package", foodPackageSchema);
