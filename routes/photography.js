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

router.post('/add', async (req, res) => {
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
        tag
    } = req.body;

    const data = new photographyModel({
        name: name,
        short_link: short_link,
        featured_image: featured_image,
        caption: caption,
        featured_images: featured_images,
        badge: badge,
        price: price,
        cost_price: cost_price,
        type: type,
        is_wishlisted: is_wishlisted,
        ratings: ratings,
        attributes: attributes,
        inclusion: inclusion,
        tag: tag
    });

    try {
        // Check if a photograh with the same name and type already exists
        const existingPhotograph = await photographyModel.findOne({ name: data.name, type: data.type });

        if (existingPhotograph) {
            return res.json({ error: true, status: 503, message: 'Photograph already added.' });
        } else {
            const savedData = await data.save();
            return res.json({ error: false, status: 200, message: 'Photograph added successfully.', data: savedData });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.post('/edit', async (req, res) => {
    const id = req.body._id;
    const updatedData = req.body;
    const options = { new: true };

    try {
        const result = await photographyModel.findByIdAndUpdate(id, updatedData, options);

        if (result) {
            return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result });
        } else {
            return res.json({ error: true, status: 404, message: 'Photograph not found.' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.post('/update_photography_status', async (req, res) => {
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
        res.status(400).json({ error: true, message: error.message });
    }
});

router.get('/searchByName/:name', async (req, res) => {
    const { name } = req.params;

    try {
        const photography = await photographyModel.find({ name: { $regex: new RegExp(name, 'i') } });

        if (photography.length > 0) {
            return res.json({ error: false, status: 200, message: 'Search Successful', data: photography });
        } else {
            return res.json({ error: true, status: 404, message: 'No matching photograph found.' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.get('/searchByTag/:tag', async (req, res) => {
    const { tag } = req.params;

    try {
        const photograph = await photographyModel.find({ tag: { $in: [tag] } });

        if (photograph.length > 0) {
            return res.json({ error: false, status: 200, message: 'Search Successful', data: photograph });
        } else {
            return res.json({ error: true, status: 404, message: 'No matching photograph found.' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.get('/details/:id', async (req, res) => {
    try {
        const data = await photographyModel.findById(req.params.id).populate({
            path: "tag"
        });
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;