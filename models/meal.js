const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    configurationId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations",
      },
    ],
    name: { type: String, default: "", index: true },
    image: { type: String, default: "" },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ },
  },
  {
    strict: false,
    timestamps: true,
  },
);

// optional compound index (best practice)
mealSchema.index({ name: 1, status: 1 });

module.exports = mongoose.model("meals", mealSchema);
