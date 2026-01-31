const mongoose = require("mongoose");

const eventMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: false,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["text", "image", "video", "info"],
      default: "text",
    },
    infoType: {
      type: String,
      enum: ["user_joined", "user_left", "name_changed"],
    },

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    actorSnapshot: {
      name: String,
    },
    mediaUrl: {
      type: String,
      default: "",
    },
    senderPhone: {
      type: String,
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);
eventMessageSchema.index({ senderId: 1 });
eventMessageSchema.index({ groupId: 1, createdAt: -1 }); // For fast latest message per group

module.exports = mongoose.model("EventMessage", eventMessageSchema);
