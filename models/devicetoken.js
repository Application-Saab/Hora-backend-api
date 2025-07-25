const mongoose = require('mongoose');

const devicetokensSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId,ref: "Users" },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */}
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('devicetokens', devicetokensSchema)