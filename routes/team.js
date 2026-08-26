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

router.post('/add', async (req, res, next) => {
    try {
        const { name, number, dob } = req.body;

        const newTeam = new team({
            name,
            number,
            dob,
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


module.exports = router;
