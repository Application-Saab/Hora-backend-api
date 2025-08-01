const mongoose = require('mongoose');

const eventGuestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "eventInvites", required: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    rsvpStatus: { type: String, enum: ['will Come', 'Sure, will try', ''], default: '' },
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('eventGuests', eventGuestSchema);
