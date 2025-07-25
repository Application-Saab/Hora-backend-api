const mongoose = require('mongoose');

const userApplianceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    applianceId: { type: mongoose.Schema.Types.ObjectId, ref: "Configurations", required: true },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('userAppliance', userApplianceSchema)