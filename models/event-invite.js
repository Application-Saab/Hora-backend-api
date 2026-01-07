const mongoose = require('mongoose');

const eventInviteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    eventType: { type: String, default: '' },
    hostName: { type: String, default: '' },
    eventDate: { type: String, default: '' },
    eventTime: { type: String, default: '' },
    location: { type: String, default: '' },
    wonderland_id: { type: Number },
    externalTemplateImageKey: { type: String },
    externalTemplateImageUrl: { type: String },
    googleMapLink: {type: String, default: ''}
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('eventInvites', eventInviteSchema);