// models/venueImages.js

const mongoose = require("mongoose");

const venueImageItemSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  folderId: {
  type: mongoose.Schema.Types.ObjectId,
  default: null, // ✅ IMPORTANT
  index: true,
},
  imageUrl: { type: String, required: true },
  imageKey: { type: String, required: true },
  thumbnailUrl: { type: String, default: "" },
  thumbnailKey: { type: String, default: "" },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
  createdAt: { type: Date, default: Date.now },
});

const venueImagesSchema = new mongoose.Schema(
  {
    venueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venues", required: true },
    images: [venueImageItemSchema], // 👈 one array for all categories
  },
  { timestamps: true }
);

module.exports = mongoose.model("VenueImages", venueImagesSchema);