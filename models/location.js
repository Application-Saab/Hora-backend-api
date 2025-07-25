const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
    name: String,
    location: {
        type: { type: String, default: '' },
        coordinates: [Number],  // [<longitude>, <latitude>]
    },
    category:{ type: String, default: '' }
}, {
    strict: false,
    timestamps: true
});
LocationSchema.index( { location: "2dsphere" } )
module.exports = mongoose.model('locations', LocationSchema)