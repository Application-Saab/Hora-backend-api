const express = require('express');
const orderModel = require('../models/order');
const userModel = require('../models/user');
const commonFunction = require('../store/commonFunction');
const router = express.Router();
var async = require("async");
var ObjectId = require('mongoose').Types.ObjectId; 
// Load the full build.
var _ = require('lodash');
const AddressModel = require('../models/address');
const photographyModel = require('../models/photography');
const AddOn = require("../models/addon");
const photographyTheme = require("../models/photography-theme")
const decorationModel = require("../models/decoration")

//........... used api ...........

router.post('/add', async (req, res, next) => {
    const {
        name,
        short_link,
        featured_image,
        caption,
        featured_images,
        badge,
        price,
        cost_price,
        type,
        is_wishlisted,
        ratings,
        attributes,
        inclusion,
        tag,
        duration,
        advance_amount
    } = req.body;

    const addonIds = await AddOn.find({
        categoryType: "Photography",
        $or: [
            {
                eventId: { $in: tag }
            },
            {
                eventId: { $size: 0 },
                productId: { $size: 0 }
            }
        ]
    }).distinct("_id");

    const themeIds = await photographyTheme.find({
        categoryType: "Photography",
        $or: [
            {
                eventId: { $in: tag }
            },
            {
                eventId: { $size: 0 },
                productId: { $size: 0 }
            }
        ]
    }).distinct("_id");
    const data = new photographyModel({
        name,
        short_link,
        featured_image,
        caption,
        featured_images,
        badge,
        price,
        cost_price,
        type,
        is_wishlisted,
        ratings,
        attributes,
        inclusion,
        tag,
        duration,
        advance_amount,
        addons: addonIds,
        ThemesId: themeIds,
    });

    try {
        // Check if a photograph with the same name and type already exists
        const existingPhotograph = await photographyModel.findOne({ name: data.name, type: data.type });

        if (existingPhotograph) {
            return res.json({
                error: true,
                status: 503,
                message: 'Photograph already added.'
            });
        }

        const savedData = await data.save();
        return res.json({
            error: false,
            status: 200,
            message: 'Photograph added successfully.',
            data: savedData
        });

    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.post('/edit', async (req, res, next) => {
    const id = req.body._id;
    const updatedData = req.body;
    const options = { new: true }; // return updated doc

    try {
        const result = await photographyModel.findByIdAndUpdate(id, updatedData, options);

        if (result) {
            return res.json({
                error: false,
                status: 200,
                message: 'Updated Successfully',
                data: result
            });
        } else {
            return res.json({
                error: true,
                status: 404,
                message: 'Photograph not found.'
            });
        }

    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.get('/searchByTag/:tag', async (req, res, next) => {
    const { tag } = req.params;

    try {
        const photograph = await photographyModel.find({
            tag: { $in: [tag] }
        });

        if (photograph.length > 0) {
            return res.json({
                error: false,
                status: 200,
                message: 'Search Successful',
                data: photograph
            });
        } else {
            return res.json({
                error: true,
                status: 404,
                message: 'No matching photograph found.'
            });
        }
    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

//............. not used ..............

router.get('/details/:id', async (req, res, next) => {
    try {
        const data = await photographyModel.findById(req.params.id).populate({
            path: "tag"
        });
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        error.isPublic = true;
        next(error);
    }
})

router.post('/update_photography_status', async (req, res, next) => {
    const { _id, status } = req.body;

    if (!_id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'Id is required.' }
            ]
        });
    }

    try {
        const photography = await photographyModel.findById(_id);

        if (photography) {
            const update = {
                status: status
            };

            const result = await photographyModel.findByIdAndUpdate(_id, { $set: update });

            return res.json({ error: false, status: 200, message: 'Status Update Successfully' });
        } else {
            return res.json({ error: true, status: 404, message: 'Photograph Not Found' });
        }
    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.get('/searchByName/:name', async (req, res, next) => {
    const { name } = req.params;

    try {
        const photography = await photographyModel.find({ name: { $regex: new RegExp(name, 'i') } });

        if (photography.length > 0) {
            return res.json({ error: false, status: 200, message: 'Search Successful', data: photography });
        } else {
            return res.json({ error: true, status: 404, message: 'No matching photograph found.' });
        }
    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.get('/searchByTag/:tag', async (req, res, next) => {
    const { tag } = req.params;

    try {
        const photograph = await photographyModel.find({
            tag: { $in: [tag] }
        });

        if (photograph.length > 0) {
            return res.json({
                error: false,
                status: 200,
                message: 'Search Successful',
                data: photograph
            });
        } else {
            return res.json({
                error: true,
                status: 404,
                message: 'No matching photograph found.'
            });
        }
    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.post("/searchByTags", async (req, res, next) => {
    try {
        const { tags, categoryType } = req.body;

        if (!Array.isArray(tags) || tags.length === 0) {
            return res.status(400).json({
                error: true,
                status: 400,
                message: "tags must be a non-empty array",
            });
        }

        if (!Array.isArray(categoryType) || categoryType.length === 0) {
            return res.status(400).json({
                error: true,
                status: 400,
                message: "categoryType must be a non-empty array",
            });
        }

        const results = [];

        // Decoration
        if (categoryType.includes("Decoration")) {
            const decorations = await decorationModel
                .find({
                    tag: {
                        $in: tags,
                    },
                })
                .lean();

            results.push(...decorations);
        }

        // Photography
        if (categoryType.includes("Photography")) {
            const photographs = await photographyModel
                .find({
                    tag: {
                        $in: tags,
                    },
                })
                .lean();

            results.push(...photographs);
        }

        return res.json({
            error: false,
            status: 200,
            message: "Search Successful",
            data: results,
        });

    } catch (error) {
        error.isPublic = true;
        next(error);
    }
});

router.get('/details/:id', async (req, res, next) => {
    try {
        const data = await photographyModel.findById(req.params.id).populate({
            path: "tag"
        });
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        error.isPublic = true;
        next(error);
    }
})

module.exports = router;