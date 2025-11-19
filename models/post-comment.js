const mongoose = require("mongoose");

const postCommentsSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    commentedById: {
      type: String,
      required: true,
      trim: true,
    },
    commentedByName: {
      type: String,
      required: true,
      trim: true,
    },
    postId: {
      type: String,
      required: true,
      trim: true,
    },
    commentTitle: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false, // disables __v
  }
);

module.exports = mongoose.model("post-comments", postCommentsSchema);
