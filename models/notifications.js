const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: { type: String,default: '' },
    message: { type: String,default: '' },
    type: { type: String,default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId,ref: "Users" },
    is_read: { type: Number, default: 0 /* 1-read 0-unread */ },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('notification', notificationSchema)