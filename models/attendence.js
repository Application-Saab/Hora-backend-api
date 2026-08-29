const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
    {
        memberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "team",
            required: true,
        },
        date: {
            type: String, 
            required: true,
        },
        status: {
            type: String,
            enum: ["Present", "Absent", "Leave", "Holiday"],
            default: "Present",
        },
        leaveType: {
            type: String,
            default: "",
        },
        reason: {
            type: String, 
            default: "",
        },
    },
    { timestamps: true }
);

attendanceSchema.index({ memberId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("attendance", attendanceSchema);