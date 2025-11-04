const mongoose = require('mongoose');

const eventInviteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    userType: { type: String, default: 'host' }, 
    eventType: { type: String, default: '' },
    hostName: { type: String, default: '' },
    eventDate: { type: Date, default: Date.now },
    eventTime: { type: String, default: '' },
    location: { type: String, default: '' },
    imageUrl: { type: String },
    imageKey: { type: String },
    wonderland_id: { type: Number },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "eventTemplates" },
    externalTemplateImageKey: { type: String },
    externalTemplateImageUrl: { type: String },
    googleMapLink: {type: String, default: ''}
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('eventInvites', eventInviteSchema);