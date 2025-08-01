// const mongoose = require('mongoose');

// const templateSchema = new mongoose.Schema({
//   fileName: String,
//   svgUrl: String,
//   webpUrl: String,
//   s3SvgKey: String,
//   s3WebpKey: String,
//   category: {
//     type: String,
//     required: true
//   },
//   configs: {
//     type: Object, // Store key-value pairs
//     default: {}
//   },
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('eventTemplates', templateSchema);

const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  fileName: String,
  webpUrl: String,
  s3WebpKey: String,
  editableImageUrl: String,
  s3EditableImageKey: String,
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