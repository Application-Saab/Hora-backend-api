const express = require('express');
const orderModel = require('../models/order');
const userModel = require('../models/user');
const commonFunction = require('../store/commonFunction');
const router = express.Router();
var async = require("async");
// Load the full build.
var _ = require('lodash');
const AddressModel = require('../models/address');
const decorationModel = require('../models/decoration');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 60 * 10 }); // Cache TTL: 5 minutes

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

    const data = new decorationModel({
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
        // Check if a decoration with the same name and type already exists
        const existingDecoration = await decorationModel.findOne({ name: data.name, type: data.type });

        if (existingDecoration) {
            return res.json({ error: true, status: 503, message: 'Decoration already added.' });
        } else {
            const savedData = await data.save();
            return res.json({ error: false, status: 200, message: 'Decoration added successfully.', data: savedData });
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
        const result = await decorationModel.findByIdAndUpdate(id, updatedData, options);

        if (result) {
            return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result });
        } else {
            return res.json({ error: true, status: 404, message: 'Decoration not found.' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.post('/update_decoration_status', async (req, res) => {
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
        const decoration = await decorationModel.findById(_id);

        if (decoration) {
            const update = {
                status: status
            };

            const result = await decorationModel.findByIdAndUpdate(_id, { $set: update });

            return res.json({ error: false, status: 200, message: 'Status Update Successfully' });
        } else {
            return res.json({ error: true, status: 404, message: 'Decoration Not Found' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.get('/searchByName/:name', async (req, res) => {
    const { name } = req.params;

    try {
        const decorations = await decorationModel.find({ name: { $regex: new RegExp(name, 'i') } });

        if (decorations.length > 0) {
            return res.json({ error: false, status: 200, message: 'Search Successful', data: decorations });
        } else {
            return res.json({ error: true, status: 404, message: 'No matching decorations found.' });
        }
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});


router.get('/searchByTag/:tag', async (req, res) => {
    const { tag } = req.params;
    const cacheKey = `search_tag_${tag}`;

    try {
        // Check cache first
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({ ...cached, cached: true });
        }

        const decorations = await decorationModel.find({ tag: { $in: [tag] } });

        if (decorations.length > 0) {
            const response = {
                error: false,
                status: 200,
                message: 'Search Successful',
                data: decorations
            };
            cache.set(cacheKey, response); // Cache the response
            return res.json(response);
        } else {
            const response = {
                error: true,
                status: 404,
                message: 'No matching decorations found.'
            };
            cache.set(cacheKey, response); // Cache the not-found too (optional)
            return res.json(response);
        }
    } catch (error) {
        return res.status(400).json({ error: true, message: error.message });
    }
});


router.get('/details/:id', async (req, res) => {
    try {
        const data = await decorationModel.findById(req.params.id).populate({
            path: "tag"
        });
        return res.json({ error: false, status: 200, message: 'Details Fetch Successfully', data: data })
    }
    catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/searchByTag/v2/:tag', async (req, res) => {
    const { tag } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const priceFilter = req.query.priceFilter;
    const sortBy = req.query.sortBy;
    const theme = req.query.theme;

    const cacheKey = `search_${tag}_${limit}_${page}_${priceFilter}_${sortBy}_${theme}`;

    // Check if data exists in cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log("returning cached data with key " + cacheKey);
        return res.json({
            ...cachedData,
            cached: true
        });
    }

    const query = { tag };

    if (priceFilter === 'under2000') {
        query.price = { $lt: 2000 };
    } else if (priceFilter === '2000to5000') {
        query.price = { $gte: 2000, $lte: 5000 };
    } else if (priceFilter === 'above5000') {
        query.price = { $gt: 5000 };
    }

    if (theme && theme !== 'all') {
        const formattedThemeFilter = theme.toLowerCase().split('-')[0];
        query.name = { $regex: formattedThemeFilter, $options: 'i' };
    }

    try {
        const sortOrder = (sortBy === 'asc') ? 1 : (sortBy === 'desc') ? -1 : null;
        // Final sort criteria: always sort by popularityScore, price if applicable
        const sortCriteria = sortOrder !== null
            ? (priceFilter == 'all' || priceFilter == 'All') || (query.price != null || query.price != undefined)
            ? { popularity_score: -1, price: sortOrder }
            : { price: sortOrder, popularity_score: -1 }
            : { popularity_score: -1 };
        const decorationsQuery = decorationModel
            .find(query)
            .collation({ locale: "en", numericOrdering: true })
            .sort(sortCriteria)
            .skip((page - 1) * limit)
            .limit(limit);

        const [decorations, totalDecorations] = await Promise.all([
            decorationsQuery,
            decorationModel.countDocuments(query)
        ]);

        const response = {
            error: false,
            status: 200,
            ok: "ok",
            message: decorations.length > 0 ? 'Search Successful' : 'No matching decorations found.',
            data: decorations,
            pagination: {
                totalItems: totalDecorations,
                totalPages: Math.ceil(totalDecorations / limit),
                currentPage: page,
                limit
            }
        };

        // Store in cache
        cache.set(cacheKey, response);

        return res.json(response);
    } catch (error) {
        return res.status(500).json({
            error: true,
            message: 'Server Error: ' + error.message
        });
    }
});





module.exports = router;

