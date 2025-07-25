const express = require('express');
const ingredientTypeModel = require('../models/ingredientType');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new ingredientTypeModel({
        name: req.body.name,
        type: req.body.type
    })
    try {
        const ingredient_type = await ingredientTypeModel.find({ name: data.name, type: data.type });
        if(ingredient_type.length>0){
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
        const result = await ingredientTypeModel.findByIdAndUpdate(
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
        const data = await ingredientTypeModel.findById(req.params.id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_ingredient_type_status', async (req, res) => {
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
        const ingredient_type = await ingredientTypeModel.find({ _id: req.body._id });
        if(ingredient_type.length>0){
            const update = {
                status: req.body.status
            };
            const result = await ingredientTypeModel.findByIdAndUpdate(ingredient_type[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_ingredient_type_list', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    const { type } = req.body;
    if(type){
        finder['type']= Number(req.body.type);
    }else{
        // delete finder.type;
    }
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i') 
    }
    try {
        const ingredient_type = await ingredientTypeModel.aggregate(
            [
                {
                    $match: finder
                },
                {
                    $sort: { name: 1 }
                },
                { $match: { "_id": { '$nin': [] } } },
                {
                    $skip: Number(req.body.page - 1) * Number(req.body.per_page)
                },
                {
                    $limit: Number(req.body.per_page)
                }
            ]
        );
        let OverallResult = ingredient_type;
        const totalingredient_type = await ingredientTypeModel.count(finder);
        let paginate = {
            "total_item": totalingredient_type,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalingredient_type) / parseInt(req.body.per_page))
        }
        if(ingredient_type.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { ingredient_type: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;