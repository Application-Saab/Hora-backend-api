const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
    {
        phoneNumber: {
            type: String,
            trim: true,
        },
        agentName: {
            type: String,
            trim: true,
        },
        date: {
            type: String,
        },
        source: {
            type: String,
            trim: true,
        },
        lastSyncedRow: {
            type: Number,
            default: 0
        },
        eventDate: {
            type: String,
        },
        orderSummary:{
            type:String,
        },
        eventDetails:{
            type:String,
        },
        agent_phone: { type: String },
    },
    {
        timestamps: true,
    }
);
leadSchema.index(
    { phoneNumber: 1, agentName: 1 },
    { sparse: true }
);

leadSchema.index(
    { phoneNumber: 1, source: 1 },
    { sparse: true }
);

const Lead = mongoose.model('lead', leadSchema);

module.exports = Lead;