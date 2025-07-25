const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
    title: { type: String, default: '' },
    lat: { type: String, default: '' },
    lng: { type: String, default: '' },
    city: { type: String, default: '' },
    locality: { type: String, default: '' },
    address1: { type: String, default: '' },
    address2: { type: String, default: '' },
    address_type: { type: Number, default: '1' /* 1-home 2-work 3-hotel 4-other  */ },
    status: { type: Number, default: '1' /* 1-active 0-inactive 2-delete  */ }
}, { strict: false, timestamps: true });
module.exports = mongoose.model('address', addressSchema)