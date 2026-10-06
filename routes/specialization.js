const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const userModel = require("../models/user");
const Specialization = require("../models/specializationModel");
let multer = require("multer");



const specializationStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const folder = "./uploads/specialization";

        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }

        cb(null, folder);
    },

    filename: function (req, file, cb) {
        const uniqueSuffix =
            Date.now() + "-" + Math.floor(Math.random() * 1000000);

        cb(
            null,
            "specialization-" +
            uniqueSuffix +
            path.extname(file.originalname)
        );
    },
});

const specializationUpload = multer({
    storage: specializationStorage,
});

// GET
router.get("/get", async (req, res) => {
    try {
        const specializations = await Specialization.find();

        return res.status(200).json({
            status: 200,
            message: "Specializations fetched successfully",
            data: specializations,
        });
    } catch (error) {
        console.error("Get Specializations Error:", error);

        return res.status(500).json({
            status: 500,
            message: "Something went wrong",
        });
    }
});

// ADD
router.post(
    "/add",
    specializationUpload.single("image"),
    async (req, res, next) => {
        try {
            const { name } = req.body;

            if (!name || !req.file) {
                return res.status(400).json({
                    error: true,
                    message: "name and image are required",
                });
            }

            const newSpecialization = new Specialization({
                name,
                image: req.file.filename,
            });

            const savedSpecialization =
                await newSpecialization.save();

            return res.status(201).json({
                status: 201,
                error: false,
                message: "Specialization added successfully",
                data: savedSpecialization,
            });

        } catch (error) {
            console.error("Add Specialization Error:", error);
            next(error);
        }
    }
);


// EDIT
router.put(
    "/edit/:id",
    specializationUpload.single("image"),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { name } = req.body;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: true,
                    message: "Invalid Specialization ID",
                });
            }

            const existingSpecialization =
                await Specialization.findById(id);

            if (!existingSpecialization) {
                return res.status(404).json({
                    error: true,
                    message: "Specialization not found",
                });
            }

            const oldImage = existingSpecialization.image;

            const newImage = req.file
                ? req.file.filename
                : oldImage;

            const updatedSpecialization =
                await Specialization.findByIdAndUpdate(
                    id,
                    {
                        name,
                        image: newImage,
                    },
                    {
                        new: true,
                    }
                );

            if (req.file && oldImage && oldImage !== newImage) {
                const oldImagePath = path.join(
                    __dirname,
                    "../uploads/specialization",
                    oldImage
                );

                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);

                    console.log(
                        "Old specialization image deleted:",
                        oldImage
                    );
                }
            }

            return res.status(200).json({
                success: true,
                error: false,
                status: 200,
                message: "Specialization updated successfully",
                data: updatedSpecialization,
            });

        } catch (error) {
            console.error(
                "Edit Specialization Error:",
                error
            );
            next(error);
        }
    }
);


// DELETE
router.post("/delete/:id", async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: true,
                message: "Invalid Specialization ID",
            });
        }

        const specialization =
            await Specialization.findById(id);

        if (!specialization) {
            return res.status(404).json({
                error: true,
                message: "Specialization not found",
            });
        }

        // Delete image from folder
        if (specialization.image) {
            const imagePath = path.join(
                __dirname,
                "../uploads/specialization",
                specialization.image
            );

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log(
                    "Specialization image deleted:",
                    specialization.image
                );
            } else {
                console.log(
                    "Image not found:",
                    imagePath
                );
            }
        }

        await Specialization.findByIdAndDelete(id);

        return res.status(200).json({
            status: 200,
            success: true,
            message: "Specialization deleted successfully",
        });

    } catch (error) {
        console.error("Delete Specialization Error:", error);
        next(error);
    }
});

router.get("/user/specializations", async (req, res) => {
    try {
        const userId = req.user._id;

        const user = await userModel
            .findById(userId)
            .populate("userSpecializations");

        if (!user) {
            return res.status(404).json({
                error: true,
                status: 404,
                message: "User not found",
            });
        }

        return res.status(200).json({
            error: false,
            status: 200,
            message: "Specializations fetched successfully",
            data: user.userSpecializations || [],
        });

    } catch (error) {
        console.error(
            "Get User Specializations Error:",
            error
        );

        return res.status(500).json({
            error: true,
            status: 500,
            message: "Something went wrong",
        });
    }
});


router.put("/user/specializations", async (req, res) => {
    try {
        const {
            userId,
            userSpecializations
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                status: 400,
                message: "User ID is required",
            });
        }

        if (!Array.isArray(userSpecializations)) {
            return res.status(400).json({
                error: true,
                status: 400,
                message: "userSpecializations must be an array",
            });
        }

        const user = await userModel.findById(userId);

        if (!user) {
            return res.status(404).json({
                error: true,
                status: 404,
                message: "User not found",
            });
        }

        user.userSpecializations = userSpecializations;

        await user.save();

        const updatedUser = await userModel
            .findById(userId)
            .populate("userSpecializations");

        return res.status(200).json({
            error: false,
            status: 200,
            message: "Specializations updated successfully",
            data: updatedUser.userSpecializations || [],
        });

    } catch (error) {
        console.error(
            "Update User Specializations Error:",
            error
        );

        return res.status(500).json({
            error: true,
            status: 500,
            message: "Something went wrong",
        });
    }
});

module.exports = router;