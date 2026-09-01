const express = require('express');
const router = express.Router();
const team = require('../models/team');
const Attendance = require("../models/attendence.js")

router.get('/getAll', async (req, res, next) => {
    try {
        const { number } = req.query;

        const filter = {};

        if (number) {
            filter.number = Number(number);
        }

        const teams = await team.find(filter).sort({ createdAt: -1 });

        return res.status(200).json({
            error: false,
            message: "All team fetched successfully",
            data: teams,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/add", async (req, res, next) => {
    try {
        const {
            name,
            number,
            alternativeNumber,
            dob,
            address,
            weekOff
        } = req.body;

        const newTeam = new team({
            name: name || "",
            number: number ? Number(number) : 0,
            alternativeNumber: alternativeNumber
                ? Number(alternativeNumber)
                : 0,
            dob: dob || "",
            address: address || "",
            weekOff: weekOff || "",
        });

        const savedTeam = await newTeam.save();

        return res.status(201).json({
            error: false,
            message: "Team added successfully",
            data: savedTeam,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/get-monthly', async (req, res, next) => {
    try {
        const { month, year } = req.query;
        const startDate = `${year}-${String(Number(month) + 1).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(Number(month) + 1).padStart(2, '0')}-31`;

        const records = await Attendance.find({
            date: { $gte: startDate, $lte: endDate }
        });

        return res.status(200).json({ error: false, data: records });
    } catch (error) {
        next(error);
    }
});
        
router.put('/edit/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const {
            name,
            number,
            alternativeNumber,
            dob,
            address,
            weekOff
        } = req.body;

        const updatedTeam = await team.findByIdAndUpdate(
            id,
            {
                name,
                number,
                alternativeNumber,
                dob,
                address,
                weekOff
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!updatedTeam) {
            return res.status(404).json({
                error: true,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            error: false,
            message: "Team updated successfully",
            data: updatedTeam,
        });

    } catch (error) {
        next(error);
    }
});

router.post('/mark', async (req, res, next) => {
    try {
        const { memberId, date, status } = req.body;

        const updated = await Attendance.findOneAndUpdate(
            { memberId, date },
            { status },
            { upsert: true, new: true }
        );

        return res.status(200).json({ error: false, message: "Attendance updated", data: updated });
    } catch (error) {
        next(error);
    }
});

router.post('/apply-leave', async (req, res, next) => {
    try {
        const { memberId, date, leaveType, reason } = req.body;

        const updated = await Attendance.findOneAndUpdate(
            { memberId, date },
            { status: "Leave", leaveType, reason },
            { upsert: true, new: true }
        );

        return res.status(200).json({ error: false, message: "Leave applied successfully", data: updated });
    } catch (error) {
        next(error);
    }
});

router.post('/declare-holiday', async (req, res, next) => {
    try {
        const { date, title, memberId } = req.body;

        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required' });
        }

        if (memberId && memberId !== 'all') {
            await Attendance.findOneAndUpdate(
                { memberId, date },
                { status: "Holiday", reason: title || "Official Holiday" },
                { upsert: true, new: true }
            );
        } else {
            const allMembers = await team.find({}, '_id');
            if (allMembers.length > 0) {
                const operations = allMembers.map(m => ({
                    updateOne: {
                        filter: { memberId: m._id, date },
                        update: { status: "Holiday", reason: title || "Official Holiday" },
                        upsert: true
                    }
                }));
                await Attendance.bulkWrite(operations);
            }
        }

        return res.status(200).json({ success: true, message: 'Holiday updated successfully' });
    } catch (err) {
        next(err);
    }
});

router.post('/delete/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const deletedTeam = await team.findByIdAndDelete(id);

        if (!deletedTeam) {
            return res.status(404).json({
                error: true,
                message: "Team not found",
            });
        }

        return res.status(200).json({
            error: false,
            message: "Team deleted successfully",
            data: deletedTeam,
        });
    } catch (error) {
        next(error);
    }
});


module.exports = router;
