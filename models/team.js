const mongoose = require("mongoose");

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

        dob: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("team", teamSchema);