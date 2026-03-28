const mongoose = require("mongoose");

const celebrationBoostersSchema = new mongoose.Schema(
  {
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
    badge: String,
    price: {
      type: Number,
    },
    cost_price: {
      type: Number,
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
    status: { type: Number, default: 1 /* 1-active 2-inactive 3-delete  */ },
    discount: Number,
    designType: { type: Object, default: {} },
  },
  {
    strict: false,
    timestamps: true,
  },
);

celebrationBoostersSchema.index({ tag: 1, name: 1 });

const CelebrationBooster = mongoose.model(
  "celebration-booster",
  celebrationBoostersSchema,
);

module.exports = CelebrationBooster;
