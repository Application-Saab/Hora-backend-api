const express = require('express');
const { default: mongoose } = require('mongoose');
const ingredientModel = require('../models/ingredient');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new ingredientModel({
        name: req.body.name,
        image: req.body.image,
        ingredientTypeId: req.body.ingredientTypeId
    })
    try {
        const ingredient = await ingredientModel.find({ name: data.name, ingredientTypeId: data.ingredientTypeId });
        if(ingredient.length>0){
            return res.json({ error: true,status:503, message: 'Already Added' })
        }else{
            const dataToSave = await data.save();
            return res.json({ error: false,status:200, message: 'Added Successfully', data:dataToSave})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/edit', async (req, res) => {
    const id = req.body._id;
    const updatedData = req.body;
    const options = { new: true };
    try {
        const result = await ingredientModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false,status:200, message: 'Updated Successfully', data:result})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/details/:id', async (req, res) => {
    try {
        const data = await ingredientModel.findById(req.params.id).populate("ingredientTypeId");
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_ingredient_status', async (req, res) => {
    const { _id } = req.body;
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
        const ingredient = await ingredientModel.find({ _id: req.body._id });
        if(ingredient.length>0){
            const update = {
                status: req.body.status
            };
            const result = await ingredientModel.findByIdAndUpdate(ingredient[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})
// used in admin  fixed
router.post('/admin_ingredient_list', async (req, res) => {
    try {
        // Filter
        let finder = {
            status: { $ne: 2 }
        };

        const type = req.body?.type;

        const page = Number(req.body?.page) || 1;
        const perPage = Number(req.body?.per_page) || 20;

        if (req.body?.name) {
            finder.name = new RegExp(req.body.name.trim(), 'i');
        }

        // Aggregate query
        const ingredient = await ingredientModel.aggregate([
            { $match: finder },
            {
                $lookup: {
                    from: 'ingredienttypes',
                    localField: 'ingredientTypeId',
                    foreignField: '_id',
                    pipeline: [{ $project: { name: 1, _id: 0 } }],
                    as: 'ingredientTypeId'
                }
            },
            { $sort: { name: 1 } },
            { $match: { _id: { $nin: [] } } },
            { $skip: (page - 1) * perPage },
            { $limit: perPage }
        ]);

        const totalingredient = await ingredientModel.countDocuments(finder);

        const paginate = {
            total_item: totalingredient,
            showing: ingredient.length,
            first_page: 1,
            previous_page: perPage,
            current_page: page,
            next_page: page + 1,
            last_page: Math.ceil(totalingredient / perPage)
        };

        if (ingredient.length > 0) {
            return res.json({
                error: false,
                status: 200,
                message: 'Fetch Data Successfully',
                data: { ingredient, paginate }
            });
        } else {
            return res.json({
                error: true,
                status: 503,
                message: 'No Record Found'
            });
        }

    } catch (error) {
        return res.status(400).json({
            message: error.message,
            error: true
        });
    }
});

module.exports = router;