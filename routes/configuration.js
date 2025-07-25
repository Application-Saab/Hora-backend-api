const express = require('express');
const ConfigurationModel = require('../models/configuration');
const commonFunction= require('../store/commonFunction');
const router = express.Router();

router.post('/add', async (req, res) => {
    const data = new ConfigurationModel({
        name: req.body.name,
        image: req.body.image,
        type: req.body.type,
        sub_type: req.body.sub_type,
    })
    try {
        const configuration = await ConfigurationModel.find({ name: data.name, type: data.type });
        if(configuration.length>0){
            return res.json({ error: true,status:503, message: `${commonFunction.capitalizeFirstLetter(data.type)}`+' Already Added' })
        }else{
            const dataToSave = await data.save();
            return res.json({ error: false,status:200, message: `${commonFunction.capitalizeFirstLetter(data.type)}`+' Added Successfully', data:dataToSave})
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
        const result = await ConfigurationModel.findByIdAndUpdate(
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
        const data = await ConfigurationModel.findById(req.params.id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_configuration_status', async (req, res) => {
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
        const configuration = await ConfigurationModel.find({ _id: req.body._id });
        if(configuration.length>0){
            const update = {
                status: req.body.status
            };
            const result = await ConfigurationModel.findByIdAndUpdate(configuration[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'Details Not Found' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_configuration_list', async (req, res) => {
    let finder ={
        status: 1
    };
    const type = req.body.type;
    const sub_type = req.body.sub_type;
    if (type) {
        finder['type']= req.body.type; 
    }
    if (sub_type) {
        finder['sub_type']= req.body.sub_type; 
    }
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 100;
    }
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i') 
    }
    try {
        const configuration = await ConfigurationModel.aggregate(
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
        let OverallResult = configuration;
        const totalConfiguration = await ConfigurationModel.count(finder);
        let paginate = {
            "total_item": totalConfiguration,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalConfiguration) / parseInt(req.body.per_page))
        }
        if(configuration.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { configuration: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/admin_configuration_list_all', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    const type = req.body.type;
    const sub_type = req.body.sub_type;
    if (type) {
        finder['type']= req.body.type; 
    }
    if (sub_type) {
        finder['sub_type']= req.body.sub_type; 
    }
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 100;
    }
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i') 
    }
    try {
        const configuration = await ConfigurationModel.aggregate(
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
        let OverallResult = configuration;
        const totalConfiguration = await ConfigurationModel.count(finder);
        let paginate = {
            "total_item": totalConfiguration,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalConfiguration) / parseInt(req.body.per_page))
        }
        if(configuration.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { configuration: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;