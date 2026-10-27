
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Holiday = require("../models/holidays");

// 1. ADD HOLIDAY
router.post("/add", async (req, res) => {
    try {
        const { holidayName, date, isOptional, description } = req.body;

        if (!holidayName || !date) {
            return res.status(400).json({
                success: false,
                message: "Holiday name and date are required",
            });
        }

        if (isNaN(new Date(date).getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid holiday date",
            });
        }

        const holiday = await Holiday.create({
            holidayName,
            date: new Date(date),
            isOptional: isOptional ?? false,
            description: description || "",
        });

        return res.status(201).json({
            success: true,
            message: "Holiday added successfully",
            data: holiday,
        });
    } catch (error) {
        console.error("Add Holiday Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add holiday",
        });
    }
});

// 2. GET ALL HOLIDAYS
router.get("/all", async (req, res) => {
    try {
        const { year } = req.query;

        const filter = {};

        if (year !== undefined) {
            const selectedYear = Number(year);

            if (
                !Number.isInteger(selectedYear) ||
                selectedYear < 1900 ||
                selectedYear > 9999
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid year",
                });
            }

            filter.date = {
                $gte: new Date(Date.UTC(selectedYear, 0, 1)),
                $lt: new Date(Date.UTC(selectedYear + 1, 0, 1)),
            };
        }

        const holidays = await Holiday.find(filter).sort({ date: 1 });

        return res.status(200).json({
            success: true,
            count: holidays.length,
            data: holidays,
        });
    } catch (error) {
        console.error("Get Holidays Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch holidays",
        });
    }
});

// 3. GET SINGLE HOLIDAY
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Holiday ID",
            });
        }

        const holiday = await Holiday.findById(id);

        if (!holiday) {
            return res.status(404).json({
                success: false,
                message: "Holiday not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: holiday,
        });
    } catch (error) {
        console.error("Get Holiday Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch holiday",
        });
    }
});

// 4. EDIT HOLIDAY
router.put("/edit/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Holiday ID",
            });
        }

        const allowedFields = [
            "holidayName",
            "date",
            "isOptional",
            "description",
        ];

        const updateData = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields provided to update",
            });
        }

        if (
            updateData.holidayName !== undefined &&
            !String(updateData.holidayName).trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Holiday name cannot be empty",
            });
        }

        if (updateData.date !== undefined) {
            const parsedDate = new Date(updateData.date);

            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid holiday date",
                });
            }

            updateData.date = parsedDate;
        }

        if (
            updateData.isOptional !== undefined &&
            typeof updateData.isOptional !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "isOptional must be true or false",
            });
        }

        const updatedHoliday = await Holiday.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedHoliday) {
            return res.status(404).json({
                success: false,
                message: "Holiday not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Holiday updated successfully",
            data: updatedHoliday,
        });
    } catch (error) {
        console.error("Edit Holiday Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update holiday",
        });
    }
});

// 5. DELETE HOLIDAY
router.post("/delete/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Holiday ID",
            });
        }

        const deletedHoliday = await Holiday.findByIdAndDelete(id);

        if (!deletedHoliday) {
            return res.status(404).json({
                success: false,
                message: "Holiday not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Holiday deleted successfully",
            data: deletedHoliday,
        });
    } catch (error) {
        console.error("Delete Holiday Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete holiday",
        });
    }
});

module.exports = router;
