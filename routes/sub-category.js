const express = require('express');
const subcategoryModel = require('../models/sub_category');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new subcategoryModel({
        name: req.body.name,
        categoryId: req.body.categoryId,
    })
    try {
        const subcategory = await subcategoryModel.find({ name: data.name, categoryId: data.categoryId });
        if(subcategory.length>0){
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
        const result = await subcategoryModel.findByIdAndUpdate(
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
        const data = await subcategoryModel.findById(req.params.id).populate("categoryId")
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_subcategory_status', async (req, res) => {
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
        const subcategory = await subcategoryModel.find({ _id: req.body._id });
        if(subcategory.length>0){
            const update = {
                status: req.body.status
            };
            const result = await subcategoryModel.findByIdAndUpdate(subcategory[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_subcategory_list', async (req, res) => {
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
        const subcategory = await subcategoryModel.aggregate(
            [
                {
                    $match: finder
                },
                {
                    $sort: { updatedAt: -1 }
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
        let OverallResult = subcategory;
        const totalsubcategory = await subcategoryModel.count(finder);
        let paginate = {
            "total_item": totalsubcategory,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalsubcategory) / parseInt(req.body.per_page))
        }
        if(subcategory.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { subcategory: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;