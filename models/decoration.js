const mongoose = require("mongoose");

const decorationSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    name: {
      type: String,
      required: true,
    },
    short_link: {
      type: String,
    },
    featured_image: {
      type: String,
    },
    caption: String,
    featured_images: [
      {
        fileName: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    badge: String,
    price: {
      type: String,
    },
    cost_price: {
      type: String,
    },
    type: String,
    is_wishlisted: {
      type: Boolean,
      default: false,
    },
    ratings: {
      score: Number,
      count: Number,
    },
    attributes: {
      price_subtext: [String],
      locality: [String],
      caption: [String],
    },
    inclusion: [String],
    tag: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "meals",
      },
    ],
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ },
    discount: Number,
    popularity_score: {
      type: Number,
      default: null,
    },
    designType: { type: Object, default: {} },

    productUrl: {
      type: String,
      default: "",
    },
    
  },
  {
    strict: false,
    timestamps: true,
  },
);

// Indexes
decorationSchema.index({ tag: 1, status: 1, popularity_score: -1, price: 1 });
decorationSchema.index({ tag: 1, status: 1, price: 1, popularity_score: -1 });
decorationSchema.index({ tag: 1, status: 1, name: 1 });

const Decoration = mongoose.model("decoration", decorationSchema);

module.exports = Decoration;
