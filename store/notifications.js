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

exports.sendNotifications = function (deviceToken, user_id, title, MsgBody, ID, Type, url, sound = "notification") {
  var message = {
    token: deviceToken,
    notification: {
      title: title,
      body: MsgBody
    },
    "android": {
      priority: "high",
      "notification": {
        "channel_id":
          sound === "emergency_notification"
            ? "fcm_emergency_sound_channel"
            : "fcm_custom_sound_channel_v2", // Must match the ID from createChannel
        sound: sound, 
        default_sound: false   
      }
    },
    data: {
      id: ID ? String(ID) : '',
      type: Type ? String(Type) : '',
      url: url ? String(url) : '',
      sound: sound
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


// require("dotenv").config();

// const admin = require("firebase-admin");
// const serviceAccount = require("../serviceAccount.json");

// try {
//   admin.initializeApp(
//     {
//       credential: admin.credential.cert(serviceAccount),
//     },
//     "app1"
//   );
// } catch (e) {
//   console.warn("Firebase admin init error:", e);
// }

// const notificationModel = require("../models/notifications");

// exports.sendNotifications = async function (
//   deviceToken,
//   user_id,
//   title,
//   MsgBody,
//   ID,
//   Type,
//   url,
//   sound = "notification"
// ) {
//   if (!deviceToken) {
//     throw new Error("FCM device token is missing");
//   }

//   const message = {
//     token: deviceToken,

//     notification: {
//       title: title,
//       body: MsgBody,
//     },

//     android: {
//       priority: "high",

//       notification: {
//         channelId:
//           sound === "emergency_notification"
//             ? "fcm_emergency_sound_channel"
//             : "fcm_custom_sound_channel_v2",

//         sound: sound,

//         defaultSound: false,
//       },
//     },

//     data: {
//       id: ID ? String(ID) : "",
//       type: Type ? String(Type) : "",
//       url: url ? String(url) : "",
//       sound: sound,
//     },
//   };

//   try {
//     const response = await admin
//       .app("app1")
//       .messaging()
//       .send(message);

//     console.log("FCM notification sent successfully:", response);

//     const data = new notificationModel({
//       title: title,
//       message: MsgBody,
//       userId: user_id,
//       type: Type,
//     });

//     await data.save();

//     return response;

//   } catch (error) {
//     console.error("FCM notification failed:", {
//       message: error.message,
//       code: error.code,
//       stack: error.stack,
//     });

//     // IMPORTANT:
//     // Error ko swallow mat karo.
//     throw error;
//   }
// };