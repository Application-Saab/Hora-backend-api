const express = require('express');
const mealModel = require('../models/meal');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new mealModel({
        name: req.body.name,
        configurationId: req.body.configurationId,
        image: req.body.image,
    })
    try {
        const meal = await mealModel.find({ name: data.name, configurationId: data.configurationId });
        if(meal.length>0){
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
        const result = await mealModel.findByIdAndUpdate(
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
        const data = await mealModel.findById(req.params.id)
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/idByTag', async (req, res) => {
    const {tag} = req.query;
    
    try {
        const data = await mealModel.findOne({name:tag});
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})


router.post('/update_meals_status', async (req, res) => {
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
        const meal = await mealModel.find({ _id: req.body._id });
        if(meal.length>0){
            const update = {
                status: req.body.status
            };
            const result = await mealModel.findByIdAndUpdate(meal[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_meals_list', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    const { type } = req.body;
    if(type){
        finder['type']= Number(req.body.type);
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
        const meal = await mealModel.aggregate(
            [
                {$match: finder},
                { $lookup : { from: 'configurations',localField: 'configurationId', foreignField: '_id',pipeline: [
                    { $project: { name: 1,_id:0 } },
                 ], as: 'configurationId'}},
                {$sort: { name: 1 }},
                { $match: { "_id": { '$nin': [] } } },
                {$skip: Number(req.body.page - 1) * Number(req.body.per_page)},
                {$limit: Number(req.body.per_page)}
            ]
        );
        let OverallResult = meal;
        const totalmeal = await mealModel.count(finder);
        let paginate = {
            "total_item": totalmeal,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalmeal) / parseInt(req.body.per_page))
        }
        if(meal.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { meal: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;