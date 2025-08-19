const mongoose = require('mongoose');

const driveImportedImagesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model
    required: true,
    unique: true // One document per user
  },
  images: [{
    originalName: { type: String, required: true },
    url: { type: String, required: true }, // S3 original URL
    key: { type: String, required: true }, // S3 original key
    thumbnailUrl: { type: String, required: true }, // S3 thumbnail URL
    thumbnailKey: { type: String, required: true }, // S3 thumbnail key
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('DriveImportedImages', driveImportedImagesSchema);