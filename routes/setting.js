const express = require('express');
const settingModel = require('../models/setting');
const dishsettingModel = require('../models/dish-setting');
const router = express.Router();

router.post('/update', async (req, res) => {
    try {
        const id = "63f053d1cb94c0eb0b66f8a6";
        const updatedData = req.body;
        const options = { new: true };
        const result = await settingModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false,status:200, message: 'Settings Updated Successfully', data:result})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/details', async (req, res) => {
    try {
        const id = "63f053d1cb94c0eb0b66f8a6";
        const data = await settingModel.findById(id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/add', async (req, res) => {
    const data = new dishsettingModel({
        dish_allowed_per_order: req.body.dish_allowed_per_order,
        dish_allowed_with_1_burner: req.body.dish_allowed_with_1_burner,
        dish_allowed_with_2_burner: req.body.dish_allowed_with_2_burner,
        dish_allowed_with_3_burner: req.body.dish_allowed_with_3_burner,
        dish_allowed_with_4_burner: req.body.dish_allowed_with_4_burner,
        dish_allowed_with_5_burner: req.body.dish_allowed_with_5_burner,
        dish_allowed_with_6_burner: req.body.dish_allowed_with_6_burner,
        noofcuisine_per_order: req.body.noofcuisine_per_order,
        breakfast_start_time: req.body.breakfast_start_time,
        breakfast_end_time: req.body.breakfast_end_time,
        lunch_serving_start_time: req.body.lunch_serving_start_time,
        lunch_serving_end_time: req.body.lunch_serving_end_time,
        dinner_serving_start_time: req.body.dinner_serving_start_time,
        dinner_serving_end_time: req.body.dinner_serving_end_time,
        minimum_no_of_people_required: req.body.minimum_no_of_people_required,
        maximum_no_of_people_required: req.body.maximum_no_of_people_required,
        minimum_gap_order_time: req.body.minimum_gap_order_time,
        maximum_dish_allowed_with_meal: req.body.maximum_dish_allowed_with_meal,
        noofmeals_per_order: req.body.noofmeals_per_order,
    })
    try {
        const dataToSave = await data.save();
        return res.json({ error: false,status:200, message: 'Dish Setting Added Successfully', data:dataToSave})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/updateDishSetting', async (req, res) => {
    try {
        const id = "641fdee8fd26244f7ad65aff";
        const updatedData = req.body;
        const options = { new: true };
        const result = await dishsettingModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false,status:200, message: 'Settings Updated Successfully', data:result})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/dishSettingDetails', async (req, res) => {
    try {
        const id = "641fdee8fd26244f7ad65aff";
        const data = await dishsettingModel.findById(id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;