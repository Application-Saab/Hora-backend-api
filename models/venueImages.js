// // models/venueImages.js

const mongoose = require("mongoose");

// const venueImageItemSchema = new mongoose.Schema({
//   name: { type: String, default: "" },
// folderIds: {
//   type: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "SubFolder",
//     }
//   ],
//   default: [], // ✅ VERY IMPORTANT
// },
//   imageUrl: { type: String, required: true },
//   imageKey: { type: String, required: true },
//   thumbnailUrl: { type: String, default: "" },
//   thumbnailKey: { type: String, default: "" },
//   uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
//   createdAt: { type: Date, default: Date.now },
// });

// const venueImagesSchema = new mongoose.Schema(
//   {
//     venueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venues", required: true },
//     images: [venueImageItemSchema], // 👈 one array for all categories
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("VenueImages", venueImagesSchema);



const venueImageSchema = new mongoose.Schema(
  {
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venues",
      required: true,
      index: true,
    },

    name: { type: String, default: "" },

    folderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubFolder",
      },
    ],

    imageUrl: { type: String, required: true },
    imageKey: { type: String, required: true },

    thumbnailUrl: { type: String },
    thumbnailKey: { type: String },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
  },
  { timestamps: true }
);

// Indexes
venueImageSchema.index({ venueId: 1, createdAt: -1 });
venueImageSchema.index({ folderIds: 1 });

module.exports = mongoose.model("VenueImages", venueImageSchema);