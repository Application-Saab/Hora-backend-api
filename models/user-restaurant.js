const mongoose = require('mongoose');

const userRestaurantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    name: { type: String, default: '' },
    profile: { type: String, default: '' },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('userRestaurant', userRestaurantSchema)