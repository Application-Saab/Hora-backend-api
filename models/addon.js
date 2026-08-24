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
      type: String, 
      required: true,
    },
    categoryType: {
      type: [String],
      default: [],
    },
    eventId: {
      type:[],
      default:[],
    },
    productId :{
      type:[],
      default:[],
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AddOn", addOnSchema);
