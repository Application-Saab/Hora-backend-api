const webpush = require("web-push");
const PushSub = require("../models/pushSubscription");
const admin = require("firebase-admin");
const serviceAccount = require("../wonderlandServices.json");
require("dotenv").config();

if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.warn("VAPID keys missing. Web Push will fail.");
}
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "wonderland-hora",
  });
} catch (e) {
  console.warn("Firebase admin init error", e);
}

async function sendToWebPushSubscription(subscriptionDoc, payloadObj) {
  try {
    await webpush.sendNotification(
      subscriptionDoc.subscription,
      JSON.stringify(payloadObj)
    );
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSub.deleteOne({ _id: subscriptionDoc._id });
    }
    console.error("WebPush send error", err);
    return { ok: false, error: err };
  }
}

// Send FCM push to device token (android/chrome when using FCM token)
async function sendToFcmToken(fcmToken, payloadObj) {
  if (!admin.apps.length) {
    console.warn("Firebase admin not initialized; skipping FCM.");
    return { ok: false, error: "firebase-admin not initialized" };
  }
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: payloadObj.title,
        body: payloadObj.body,
      },
      data: payloadObj.data
        ? Object.fromEntries(
            Object.entries(payloadObj.data).map(([k, v]) => [k, String(v)])
          )
        : {},
      android: {
        priority: "high",
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    };
    const res = await admin.messaging().send(message);
    return { ok: true, result: res };
  } catch (err) {
    console.error("FCM send error", err);
    return { ok: false, error: err };
  }
}

// send to all subs for a room (either web-push or fcm tokens)
async function sendPushToRoom(groupId, messageText, options = {}) {
  // subs stored may include web push subscription docs and optionally fcm tokens linked to user
  const subs = await PushSub.find({
    $or: [{ groupId }, { groupId: null }],
  }).lean();

  const payloadBase = {
    title: options.title || `New message in ${options.roomName || "room"}`,
    body: options.body || String(messageText).slice(0, 120),
    icon: options.icon || "",
    data: Object.assign({ groupId: String(groupId) }, options.data || {}),
  };

  const promises = subs.map(async (s) => {
    // if this doc contains fcmToken field (we store that option), send via FCM
    if (s.fcmToken) {
      return sendToFcmToken(s.fcmToken, payloadBase);
    }
    // else webpush subscription object
    return sendToWebPushSubscription(s, payloadBase);
  });

  return Promise.all(promises);
}

module.exports = { sendPushToRoom, sendToWebPushSubscription, sendToFcmToken };
