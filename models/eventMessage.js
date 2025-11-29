// const mongoose = require("mongoose");

// const eventMessageSchema = new mongoose.Schema(
//   {
//     eventId: { type: mongoose.Schema.Types.ObjectId, ref: "eventInvites", required: true },
//     senderId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
//     message: { type: String, default: "" },
//     type: { type: String, enum: ["text", "image"], default: "text" },
//     tempId: { type: String }, // frontend temporary id
//   },
//   {
//     timestamps: true,
//   }
// );

// eventMessageSchema.index({ eventId: 1, createdAt: -1 });

// module.exports = mongoose.model("EventMessage", eventMessageSchema);




const mongoose = require("mongoose");

const eventMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
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
      enum: ["text", "image", "video"],
      default: "text",
    },
    mediaUrl: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EventMessage", eventMessageSchema);
