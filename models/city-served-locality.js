const mongoose = require('mongoose');

const cityServedlocalitySchema = new mongoose.Schema({
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "cityserveds", required: true },
    name: {  type: String,  default: '' },
    lat: {  type: String,  default: '' },
    lng: {  type: String,  default: '' },
    pincode: {  type: String,  default: '' },
    status: { type: Number, default: '1' /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});
module.exports = mongoose.model('cityServedlocality', cityServedlocalitySchema)