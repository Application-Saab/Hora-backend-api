const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    venueType: { type: String, default: '' },
    venueName: { type: String, default: '' },
    location: { type: String, default: '' },
    googleMapLink: {type: String, default: ''}
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('Venues', venueSchema);