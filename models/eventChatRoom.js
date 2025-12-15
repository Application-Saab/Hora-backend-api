const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  profileImageUrl: { type: String, default: "" },
  phone: { type: String, default: "" },
});

const chatRoomSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "EventInvite" },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "EventInvite" },
    roomProfileUrl: { type: String, default: "" },
    roomName: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    roomType: {
      type: String,
      enum: ["group", "direct"],
      default: "group",
    },
    members: [memberSchema],
    lastReadAt: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatRoom", chatRoomSchema);