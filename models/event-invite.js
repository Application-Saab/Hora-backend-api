const mongoose = require('mongoose');

const eventInviteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    eventType: { type: String, default: '' },
    hostName: { type: String, default: '' },
    eventDate: { type: Date, default: Date.now },
    eventTime: { type: String, default: '' },
    location: { type: String, default: '' },
    eventTimeLines: [{
        time: { type: String, required: true }, // e.g., "04:30 PM"
        activityName: { type: String, required: true } // e.g., "Guest Arrival + Welcome Music"
    }],
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('eventInvites', eventInviteSchema);