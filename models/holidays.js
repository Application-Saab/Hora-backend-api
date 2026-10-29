const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
    {
        holidayName: {
            type: String,
            trim: true,
        },
        date: {
            type: Date,
            required: true,
        },
        isOptional: {
            type: Boolean,
            default: false,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Holiday", holidaySchema);