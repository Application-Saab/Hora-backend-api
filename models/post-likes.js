const mongoose = require("mongoose");

const postLikesSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    likedById: {
      type: String,
      required: true,
      trim: true,
    },
    likedByName: {
      type: String,
      required: true,
      trim: true,
    },
    postId: {
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

module.exports = mongoose.model("post-likes", postLikesSchema);
