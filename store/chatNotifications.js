const webpush = require('web-push');
const PushSub = require('../models/pushSubscription');

webpush.setVapidDetails(
  'mailto:shubhsoftware1913@gmail.com',
  'BHBPued2H9tMC6x97EOQchgTE8P5d6QGaoTsfN3diqNq5oYa8nZoBv0Qb29iabLpi43C9-fFTalSAJdqCYNSA-0',
  'Y7T-Wm3EOmP7K5OW5iL90p5G8W87YXXTsHZecLGgt3E'
);

// send notification payload to one subscription
async function sendToSubscription(subscriptionDoc, payloadObj) {
  try {
    await webpush.sendNotification(subscriptionDoc.subscription, JSON.stringify(payloadObj));
    return { ok: true };
  } catch (err) {
    // if subscription is gone (410) or invalid, delete it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSub.deleteOne({ _id: subscriptionDoc._id });
    }
    console.error('Push send error', err);
    return { ok: false, error: err };
  }
}

// send to all subscriptions of a room except sender
async function sendPushToRoom(roomId, message, options = {}) {
  const subs = await PushSub.find({ $or: [{ roomId }, { roomId: null }] }); // store per-room or global
  const promises = subs.map(s => sendToSubscription(s, {
    title: options.title || `New message in ${options.roomName || 'room'}`,
    body: options.body || message.slice(0, 120),
    icon: options.icon || '/new_logo_light.png',
    data: { roomId: String(roomId), ...options.data } // used on notificationclick
  }));
  await Promise.all(promises);
}

module.exports = { sendPushToRoom, sendToSubscription };
