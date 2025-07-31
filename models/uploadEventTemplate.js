const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  fileName: String,
  svgUrl: String,
  webpUrl: String,
  s3SvgKey: String,
  s3WebpKey: String,
  category: {
    type: String,
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('eventTemplates', templateSchema);
