const express = require('express');
const router = express.Router();
const team = require('../models/team');

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
