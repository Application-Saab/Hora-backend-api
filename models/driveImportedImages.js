const mongoose = require('mongoose');

const driveImportedImagesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  images: [{
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    thumbnailKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('DriveImportedImages', driveImportedImagesSchema);