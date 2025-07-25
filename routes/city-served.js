const express = require('express');
const cityServedModel = require('../models/city-served');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new cityServedModel({
        name: req.body.name,
        lat: req.body.lat,
        lng: req.body.lng,
        pincode: req.body.pincode,
    })
    try {
        const dataToSave = await data.save();
        return res.json({ error: false,status:200, message: 'Added Successfully', data:dataToSave})
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
        const result = await cityServedModel.findByIdAndUpdate(
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
        const data = await cityServedModel.findById(req.params.id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_city_served_status', async (req, res) => {
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
        const city_served = await cityServedModel.find({ _id: req.body._id });
        if(city_served.length>0){
            const update = {
                status: req.body.status
            };
            const result = await cityServedModel.findByIdAndUpdate(city_served[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_city_served_list', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    const { name } = req.body;
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
        const city_served = await cityServedModel.aggregate(
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
        let OverallResult = city_served;
        const totalcity_served = await cityServedModel.count(finder);
        let paginate = {
            "total_item": totalcity_served,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalcity_served) / parseInt(req.body.per_page))
        }
        if(city_served.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { city_served: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/get_city_served_list', async (req, res) => {
    let finder ={
        status: 1
    };
    const { name } = req.body;
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i') 
    }
    try {
        const city_served = await cityServedModel.find(finder);
        if(city_served.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: city_served})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;