const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    email: { type: String,  default: '' },
    phone: { type: String,  default: ''  }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('setting', settingSchema)