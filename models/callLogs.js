const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
    client_call_id: { type: String, required: true, unique: true }, // Unique index duplicate prevent karne ke liye
    agent_id: { type: String, required: true },
    agent_phone: { type: String, required: true },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    phone: { type: String, required: true },
    direction: {
        type: String,
        enum: ['outgoing', 'incoming', 'missed', 'rejected', 'other'],
        required: true
    },
    status: {
        type: String,
        enum: ['connected', 'not_connected', 'missed', 'rejected'],
        required: true
    },
    started_at: { type: Date, required: true },
    ended_at: { type: Date },
    duration_seconds: { type: Number, default: 0 },
    placed_from_app: { type: Boolean, default: true },
    sim: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('callLogs', callLogSchema);