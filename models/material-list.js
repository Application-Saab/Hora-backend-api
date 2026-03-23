const mongoose = require("mongoose");

const materialListSchema = new mongoose.Schema(
  {
    specs: { type: String, default: "", required: true },
    type: { type: String, default: "", required: true },
    materialName: { type: String, default: "", required: true },
    packet: { type: String, default: "" },
    minimumOrderQuantity: { type: String, default: "" },
    materialCategory: { type: String, default: "" }, // Rented or Consumable
    vendorMaterialPrice: { type: Number, default: 0 },
    vendorMaterialRateRetail: { type: Number, default: 0 },
    vendorMaterialRateWholesale: { type: Number, default: 0 },
    rateCard: { type: String, default: "" },
    images: { type: String, default: "" },
    materialStatus: {
      type: Number,
      default: 1,
    } /* 1-active 2-inactive 3-delete  */,
  },
  {
    strict: false,
    timestamps: true,
  },
);

module.exports = mongoose.model("material-list", materialListSchema);
