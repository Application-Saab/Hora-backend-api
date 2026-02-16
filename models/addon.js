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

    image: {
      type: String, // sirf filename
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AddOn", addOnSchema);
