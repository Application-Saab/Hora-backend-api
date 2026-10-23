const mongoose = require("mongoose");

const inactivePeriodSchema = new mongoose.Schema(
    {
        from: { type: String, required: true }, // YYYY-MM-DD
        to: { type: String, default: "" },      // "" = abhi bhi inactive (open-ended)
        reason: { type: String, default: "" },
    },
    { _id: true }
);

const teamSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            default: "",
        },

        number: {
            type: Number,
            default: 0,
        },

        alternativeNumber: {
            type: Number,
            default: 0,
        },

        dob: {
            type: String,
            default: "",
        },

        address: {
            type: String,
            default: "",
        },
        weekOff: {
            type: String,
            default: "",
        },

        isActive: { type: Boolean, default: true },
        inactivePeriods: { type: [inactivePeriodSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model("team", teamSchema);