const express = require('express');
const cityServedLocalityModel = require('../models/city-served-locality');
const router = express.Router();
var ObjectId = require('mongoose').Types.ObjectId; 

router.post('/add', async (req, res) => {
    const data = new cityServedLocalityModel({
        name: req.body.name,
        cityId: req.body.cityId,
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
        const result = await cityServedLocalityModel.findByIdAndUpdate(
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
        const data = await cityServedLocalityModel.findById(req.params.id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_city_served_locality_status', async (req, res) => {
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
        const city_served_locality = await cityServedLocalityModel.find({ _id: req.body._id });
        if(city_served_locality.length>0){
            const update = {
                status: req.body.status
            };
            const result = await cityServedLocalityModel.findByIdAndUpdate(city_served_locality[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_city_served_locality_list', async (req, res) => {
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
    if (req.body.cityId) {
        finder[`cityId`] = new ObjectId(req.body.cityId)
    }
    try {
        console.log("finder>>>>>",finder);
        const city_served_locality = await cityServedLocalityModel.aggregate(
            [
                { $match: finder },
                { $lookup: { from: 'cityserveds', localField: 'cityId', foreignField: '_id', as: 'cityId' } },
                { $sort: { updatedAt: -1 } },
                { $match: { "_id": { '$nin': [] } } },
                { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
                { $limit: Number(req.body.per_page) }
            ]
        );
        let OverallResult = city_served_locality;
        const totalcity_served_locality = await cityServedLocalityModel.count(finder);
        let paginate = {
            "total_item": totalcity_served_locality,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalcity_served_locality) / parseInt(req.body.per_page))
        }
        if(city_served_locality.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { city_served_locality: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/user_city_served_locality_list', async (req, res) => {
    let finder ={
        status: 1
    };
    if (req.body.cityId != '' && req.body.cityId != 0) {
        finder[`cityId`] = new ObjectId(req.body.cityId)
    }
    try {
        console.log("finder>>>>>",finder);
        const city_served_locality = await cityServedLocalityModel.find(finder)
        if(city_served_locality.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: city_served_locality})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})
module.exports = router;