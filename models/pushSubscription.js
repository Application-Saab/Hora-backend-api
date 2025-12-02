const mongoose = require('mongoose');
const pushSubSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  roomId: { type: mongoose.Types.ObjectId, ref: 'ChatRoom', required: false },
  subscription: { type: Object, required: true }, // store PushSubscription JSON
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('PushSubscription', pushSubSchema);
