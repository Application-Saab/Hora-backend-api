const mongoose = require("mongoose");

const FolderSchema = new mongoose.Schema(
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

    capsuleBannerImageUrl:{
      type: String,
    },

    viewedBy: [
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
],
    clickCount: {
      type: Number,
      default: 0
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    vendorId: {
      type: String,
      index: true,
    },
    eventId: {
      type: String,
      ref: "eventInvites",
      index: true,
    },
    orderId: {
      type: String,
      ref: "orders",
    },
    deviceTracking: [
      {
        userId: {
          type: String,
          index: true,
        },
        deviceType: {
          type: String,
          enum: ["ios", "android"],
        },
        trackedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    totalPersonCount: {
      type: Number,
      default: 0,
    },
    shortCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["processing", "done", "failed"],
      default: "processing"
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
          thumbnailKey: { type: String }
        },

        personCount: {
          type: Number,
          default: 0,
        },

        isPersonFolder: {
          type: Boolean,
          default: false,
        },
        
        isLocker: {
    type: Boolean,
    default: false,
    },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    shareCapsuleCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

FolderSchema.index({ orderId: 1 }, { unique: true });


module.exports = mongoose.model("Folder", FolderSchema);
