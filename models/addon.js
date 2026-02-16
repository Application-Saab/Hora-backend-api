const mongoose = require("mongoose");

const addOnSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
    },

    description: String,
    image: String,

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    productType: {
      type: String,
      default: null,
    },

    categoryType: {
      type: String,
      trim: true,
      default: null,
    },

    eventType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "meals",
      default: null,
    },
  },
  { timestamps: true }
);

addOnSchema.index({ productId: 1, productType: 1 });
addOnSchema.index({ categoryType: 1 });
addOnSchema.index({ eventType: 1 });

module.exports = mongoose.model("AddOn", addOnSchema);
