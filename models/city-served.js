const mongoose = require('mongoose');

const cityServedSchema = new mongoose.Schema({
    name: {  type: String,  default: '' },
    lat: {  type: String,  default: '' },
    lng: {  type: String,  default: '' },
    pincode: {  type: String,  default: '' },
    status: { type: Number, default: '1' /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});
module.exports = mongoose.model('cityserveds', cityServedSchema)