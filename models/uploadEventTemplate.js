const { types } = require('joi');
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  fileName: String,
  webpUrl: String,
  s3WebpKey: String,
  backgroundUrl: String,
  s3BackgroundKey: String,
  isHeroImage: {type: Boolean, default: false},
  category: {
    type: String,
    required: true
  },
  configs: {
    type: Object,
    default: {}
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('eventTemplates', templateSchema);