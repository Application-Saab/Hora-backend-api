require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require("../serviceAccount.json");
try {
  admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
    },
    "app1"
  );

} catch (e) {
  console.warn("Firebase admin init error", e);
}

const notificationModel = require('../models/notifications');

exports.sendNotifications = function(deviceToken, user_id, title, MsgBody, ID, Type, url) {
  var message = {
    token: deviceToken,
    notification: {
      title: title,
      body: MsgBody
    },
    "android": {
      "notification": {
        "channel_id": "fcm_custom_sound_channel" // Must match the ID from createChannel
      }
    },
    data: {
      id: ID ? String(ID) : '',
      type: Type ? String(Type) : '',
      url: url ? String(url) : ''  
    }
  };

  return admin.app("app1").messaging().send(message)
    .then(function(response) {
      var data = new notificationModel({
        title: title,
        message: MsgBody,
        userId: user_id,
        type: Type
      });
      return data.save().then(function() {
        return response;
      });
    })
    .catch(function(error) {
      console.error('Error sending notification:', error);
      // throw error;
    });
};