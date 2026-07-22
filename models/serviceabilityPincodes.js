const mongoose = require("mongoose");

const serviceabilityPincodes = new mongoose.Schema({
    pincode: {
        type: String,
    },
    city: {
        type: String,
    },
    status: {
        type: String,
    },
    category: { type: String, trim: true } 
}, { timestamps: true });


module.exports = mongoose.model("serviceabilityPincodes", serviceabilityPincodes);