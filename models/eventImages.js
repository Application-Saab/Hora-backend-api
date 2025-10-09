const mongoose = require("mongoose");

const eventImagesSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(),
  },
  eventId: { type: String, ref: "eventInvites", required: true },
  userId: { type: String, ref: "users", required: true },
  userType: { type: String },
  luckyDrawImages: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        default: () => new mongoose.Types.ObjectId(),
      },
      ticketNumber: { type: String, required: true },
      luckyDrawImageUrl: { type: String, required: true },
      luckyDrawImageKey: { type: String, required: true },
      luckyDrawThumbnailUrl: { type: String, required: true },
      luckyDrawThumbnailKey: { type: String, required: true },
      imageType: { type: String, required: true, default: "luckyDraw" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  thankYouNoteImages: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        default: () => new mongoose.Types.ObjectId(),
      },
      thankYouNoteImageUrl: { type: String, required: true },
      thankYouNoteImageKey: { type: String, required: true },
      thankYouNoteThumbnailUrl: { type: String, required: true },
      thankYouNoteThumbnailKey: { type: String, required: true },
      imageType: { type: String, required: true, default: "thankYouNote" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  selfUploadedImages: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        default: () => new mongoose.Types.ObjectId(),
      },
      selfUploadedImageUrl: { type: String, required: true },
      selfUploadedImageKey: { type: String, required: true },
      selfUploadedThumbnailUrl: { type: String, required: false },
      selfUploadedThumbnailKey: { type: String, required: false },
      imageType: { type: String, required: true, default: "selfUploaded" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model("eventImages", eventImagesSchema);