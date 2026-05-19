const mongoose = require("mongoose");

const eventInviteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    eventType: { type: String, default: "" },
    hostName: { type: String, default: "" },
    eventDate: { type: String, default: "" },
    eventTime: { type: String, default: "" },
    location: { type: String, default: "" },
    wonderland_id: { type: Number },
    externalTemplateImageKey: { type: String },
    externalTemplateImageUrl: { type: String },
    googleMapLink: { type: String, default: "" },
    fromInternational : { type: String, default: '' },
    names: {
      one: {
        type: String,
        default: "",
        trim: true,
      },
      two: {
        type: String,
        default: "",
        trim: true,
      },
    },
    shortCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    subFolders: [
      {
        _id: {
          type: String,
          default: () => new mongoose.Types.ObjectId().toString(),
        },
        folderName: {
          type: String,
          required: true,
          trim: true,
        },
        type: {
          type: String,
          enum: ["my_photos", "others"],
          required: true,
        },
        userId: {
          type: String,
          required: true,
          index: true,
        },
        folderDp: {
          fileUrl: { type: String },
          thumbnailUrl: { type: String },
          s3Key: { type: String },
          thumbnailKey: { type: String },
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    strict: false,
    timestamps: true,
  },
);
eventInviteSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("eventInvites", eventInviteSchema);
