const express = require('express');
const addressModel = require('../models/address');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new addressModel({
        title: req.body.title,
        address_type: req.body.address_type,
        locality: req.body.locality,
        address1: req.body.address1,
        address2: req.body.address2,
        lat: req.body.lat,
        lng: req.body.lng,
        city: req.body.city,
        userId: req.user._id,
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
        const result = await addressModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false,status:200, message: 'Address Updated Successfully', data:result})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/editByUserID', async (req, res) => {
    const userID = req.body.userId;

    const updatedData = req.body;
    const options = { new: true , upsert: true };
    
    try {
        // Corrected the syntax for the query to find by userId
        const result = await addressModel.findOneAndUpdate(
            { userId: userID }, // Corrected query syntax
            updatedData,
            options
        );

        if (!result) {
            return res.status(404).json({ error: true, status: 404, message: 'Address not found' });
        }

        return res.json({ error: false, status: 200, message: 'Address Updated Successfully', data: result });
    } catch (error) {
        res.status(400).json({ message: error.message, error: true });
    }
})

router.get('/details/:id', async (req, res) => {
    try {
        const data = await addressModel.findById(req.params.id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_address_status', async (req, res) => {
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
        const address = await addressModel.find({ _id: req.body._id });
        if(address.length>0){
            const update = {
                status: req.body.status
            };
            const result = await addressModel.findByIdAndUpdate(address[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Address Delete Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/address_list', async (req, res) => {
    let finder ={
        status: 1
    };
    finder['userId']=req.user._id;
    console.log("finder",finder)
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 100;
    }
    try {
        const address = await addressModel.find(finder);
        let OverallResult = address;
        const totaladdress = await addressModel.count(finder);
        let paginate = {
            "total_item": totaladdress,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totaladdress) / parseInt(req.body.per_page))
        }
        if(address.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { address: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;