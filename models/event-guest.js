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

const mongoose = require('mongoose');

const luckyDrawTicketSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true }, // Internal unique ID
  ticketNumber: { type: String, required: true, unique: true }, // User-friendly 6-digit ticket number
  luckyDrawImageUrl: { type: String, required: true },
  luckyDrawImageKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const eventGuestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "EventInvite", required: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  rsvpStatus: { type: String, enum: ['will Come', 'Sure, will try', ''], default: '' },
  luckyDrawTickets: [luckyDrawTicketSchema], // Array of lucky draw tickets
}, {
  strict: false,
  timestamps: true
});

module.exports = mongoose.model('EventGuest', eventGuestSchema);