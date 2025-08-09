// const mongoose = require('mongoose');

// const eventGuestSchema = new mongoose.Schema({
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
//     eventId: { type: mongoose.Schema.Types.ObjectId, ref: "eventInvites", required: true },
//     name: { type: String, default: '' },
//     phone: { type: String, default: '' },
//     rsvpStatus: { type: String, enum: ['will Come', 'Sure, will try', ''], default: '' },
// }, {
//     strict: false,
//     timestamps: true
// });

// module.exports = mongoose.model('eventGuests', eventGuestSchema);



// const mongoose = require('mongoose');

// const eventGuestSchema = new mongoose.Schema({
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
//     eventId: { type: mongoose.Schema.Types.ObjectId, ref: "eventInvites", required: true },
//     name: { type: String, default: '' },
//     phone: { type: String, default: '' },
//     rsvpStatus: { type: String, enum: ['will Come', 'Sure, will try', ''], default: '' },
//     isTakenLuckyDraw: { type: Boolean, default: false },
//     luckyDrawImageUrl: { type: String, default: null },
//     luckyDrawImageKey: { type: String, default: null },
// }, {
//     strict: false,
//     timestamps: true
// });

// module.exports = mongoose.model('eventGuests', eventGuestSchema);
const mongoose = require("mongoose");

const eventGuestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "EventInvite", required: true },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    rsvpStatus: { type: String, enum: ["will Come", "Sure, will try", ""], default: "" },
  },
  {
    strict: false,
    timestamps: true,
  }
);

// Add unique index on userId and eventId combination
eventGuestSchema.index({ userId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("EventGuest", eventGuestSchema);