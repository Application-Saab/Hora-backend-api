const express = require('express');
const dishModel = require('../models/dish');
const decorationModel = require('../models/decoration');
const photographyModel = require('../models/photography')
const router = express.Router();

router.post('/add', async(req, res) => {

    if (req.body.cuisineId[0] === '65a2c9d3513d9389d34e2ec9')
    {
        const data = new decorationModel({
            name: req.body.name,
            short_link: '',
            featured_image: req.body.image,
            caption: req.body.description,
            badge: null,
            price: req.body.dish_rate,
            cost_price: req.body.price,
            type: null,
            is_wishlisted: null,
            ratings: null,
            attributes: null,
            inclusion: req.body.preperationtext,
            tag: req.body.mealId,
	    vendorMaterialPrice: req.body.vendorMaterialPrice,
            executionPrice: req.body.executionPrice,
            horaAdvance: req.body.horaAdvance
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
    }
    else if (req.body.cuisineId[0] == '66c96b2a22ed47b72117e089')
        {
            const data = new photographyModel({
                name: req.body.name,
                short_link: '',
                featured_image: req.body.image,
                caption: req.body.description,
                badge: null,
                price: req.body.dish_rate,
                cost_price: req.body.price,
                type: null,
                is_wishlisted: null,
                ratings: null,
                attributes: null,
                inclusion: req.body.preperationtext,
                tag: req.body.mealId,
		vendorMaterialPrice: req.body.vendorMaterialPrice,
        	executionPrice: req.body.executionPrice,
        	horaAdvance: req.body.horaAdvance
            });
        
            try {
                // Check if a photography with the same name and type already exists
                const existingPhotograph = await photographyModel.findOne({ name: data.name, type: data.type });
        
                if (existingPhotograph) {
                    return res.json({ error: true, status: 503, message: 'Photography already added.' });
                } else {
                    const savedData = await data.save();
                    return res.json({ error: false, status: 200, message: 'Photography added successfully.', data: savedData });
                }
            } catch (error) {
                res.status(400).json({ error: true, message: error.message });
            }
        }
    else{
        const data = new dishModel({
        name: req.body.name,
        image: req.body.image,
        is_dish: req.body.is_dish,
        description: req.body.description,
        dish_allow: req.body.dish_allow,
        cuisineId: req.body.cuisineId,
        mealId: req.body.mealId,
        dish_rate: req.body.dish_rate,
        is_preparation: req.body.is_preparation,
        cooking_min: req.body.cooking_min,
        preparation_min: req.body.preparation_min,
        is_fired: req.body.is_fired,
        price: req.body.price,
        serving_dish: req.body.serving_dish,
        special_appliance_id: req.body.special_appliance_id,
        general_appliance_id: req.body.general_appliance_id,
        is_gas: req.body.is_gas,
        ingredientUsed: req.body.ingredientUsed,
        per_plate_qty: req.body.per_plate_qty,
        cuisineArray: req.body.cuisineArray,
        mealArray: req.body.mealArray,
        catId: req.body.catId,
        preperationtext: req.body.preperationtext,
        noofpeopleServedByDish: req.body.noofpeopleServedByDish,
        vendorMaterialPrice: req.body.vendorMaterialPrice,
	executionPrice: req.body.executionPrice,
	horaAdvance: req.body.horaAdvance
    })
        try {
            const dish = await dishModel.find({ name: data.name });
            if (dish.length > 0) {
                return res.json({ error: true, status: 503, message: 'Already Added' })
            } else {
                const dataToSave = await data.save();
                return res.json({ error: false, status: 200, message: 'Added Successfully', data: dataToSave })
            }
        } catch (error) {
            res.status(400).json({ message: error.message, error: true })
        }
    }
    
})


router.post('/edit', async(req, res) => {
    const id = req.body._id;
    const updatedData = req.body;
    const options = { new: true };

    if (req.body.cuisineId[0] === "65a2d129513d9389d34e31d4")
    {
        console.log(1);
        try {
            const result = await decorationModel.findByIdAndUpdate(
                id, updatedData, options
            )
            return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result })
        } catch (error) {
            res.status(400).json({ message: error.message, error: true })
        }
    }
    else{
        try {
            const result = await dishModel.findByIdAndUpdate(
                id, updatedData, options
            )
            return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result })
        } catch (error) {
            res.status(400).json({ message: error.message, error: true })
        }
    }
})

router.get('/details/:id', async(req, res) => {
    try {
        const data = await dishModel.findById(req.params.id);
        return res.json({ error: false, status: 200, message: 'Details Fetch Successfully', data: data })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_dish_status', async(req, res) => {
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
        const dish = await dishModel.find({ _id: req.body._id });
        if (dish.length > 0) {
            const update = {
                status: req.body.status
            };
            const result = await dishModel.findByIdAndUpdate(dish[0]._id, { $set: update })
            return res.json({ error: false, status: 200, message: 'Status Update Successfully' })
        } else {
            return res.json({ error: true, status: 503, message: 'Details Not Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/user_dish_list', async(req, res) => {
    let finder = {
        status: 1
    };
    const { type } = req.body;
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i')
    }
    // if (req.body.mealId) {
    //     finder[`mealId`] = req.body.mealId
    // }
    // if (req.body.cuisineId) {
    //     finder[`cuisineId`] = req.body.cuisineId
    // }
    if (req.body.mealId) {
        finder[`mealId`] = { '$in': [ new ObjectId(req.body.mealId) ] }
    }
    if (req.body.cuisineId) {
        finder[`cuisineId`] = { '$in': [ new ObjectId(req.body.cuisineId) ] }
    }
    try {
        const dish = await dishModel.aggregate(
            [
                { $match: finder },
                { $lookup: { from: 'meals', localField: 'mealId', foreignField: '_id', pipeline: [{ $project: { name: 1, _id: 0 } }], as: 'mealId' } },
                { $lookup: { from: 'configurations', localField: 'cuisineId', foreignField: '_id', pipeline: [{ $project: { name: 1, _id: 0 } }], as: 'cuisineId' } },
                { $sort: { updatedAt: -1 } },
                { $match: { "_id": { '$nin': [] } } },
                { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
                { $limit: Number(req.body.per_page) }
            ]
        );
        let OverallResult = dish;
        const totaldish = await dishModel.count(finder);
        let paginate = {
            "total_item": totaldish,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totaldish) / parseInt(req.body.per_page))
        }
        if (dish.length > 0) {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: { dish: OverallResult, paginate } })
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

var ObjectId = require('mongoose').Types.ObjectId; 

router.post('/admin_dish_list', async(req, res) => {
    let finder = {
        status: { $ne: 2 }
    };
    const { type } = req.body;
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    if (req.body.name) {
        finder[`name`] = new RegExp((req.body.name).trim(), 'i')
    }
    if (req.body.mealId) {
        finder[`mealId`] = { '$in': [ new ObjectId(req.body.mealId) ] }
        
    }
    if (req.body.cuisineId) {
        finder[`cuisineId`] = { '$in': [ new ObjectId(req.body.cuisineId) ] }
    }
    if (req.body.is_dish) {
        finder[`is_dish`] = req.body.is_dish
    }
    if (req.body.status) {
        finder[`status`] = req.body.status
    }
    console.log("finder>>>>>>",finder);
    console.log("req.body>>>>>>",req.body);
    try {
        // const dish = await dishModel.find(finder).populate('mealId').populate('cuisineId');
        const dish = await dishModel.aggregate(
            [
                { $match: finder },
                { $lookup: { from: 'meals', localField: 'mealId', foreignField: '_id', pipeline: [{ $project: { name: 1, _id: 0 } }], as: 'mealId' } },
                { $lookup: { from: 'configurations', localField: 'cuisineId', foreignField: '_id', pipeline: [{ $project: { name: 1, _id: 0 } }], as: 'cuisineId' } },
                { $sort: { updatedAt: -1 } },
                // { $match: { "_id": { '$nin': [] } } },
                { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
                { $limit: Number(req.body.per_page) }
            ]
        );
        let OverallResult = dish;
        let totaldish = await dishModel.count(finder);
        console.log("totaldish",totaldish)

        let decoration;

        if (totaldish === 0)
        {
            console.log("A")
            finder[`tag`] = { '$in': [ new ObjectId(req.body.mealId) ] }
            delete finder.mealId;
            decoration = await decorationModel.aggregate(
                [
                    { $match: finder },
                    { $lookup: { from: 'meals', localField: 'mealId', foreignField: '_id', pipeline: [{ $project: { name: 1, _id: 0 } }], as: 'mealId' } },
                    { $sort: { updatedAt: -1 } },
                    // { $match: { "_id": { '$nin': [] } } },
                    { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
                    { $limit: Number(req.body.per_page) }
                ]
            );
            
            OverallResult = decoration;

            keysToDelete = ['short_link', 'badge', 'is_wishlisted', 'ratings', 'attributes', 'mealId']


            for (let i = 0; i < OverallResult.length; i++) {
                keysToDelete.forEach(key => delete OverallResult[i][key]);
            }

            const keyReplacements = {
                "featured_image": 'image',
                "caption": 'description',
                "inclusion": 'preperationtext',
                "tag": "mealId"
            };
            
            OverallResult.forEach(obj => {
                Object.keys(keyReplacements).forEach(oldKey => {
                    const newKey = keyReplacements[oldKey];
                    obj[newKey] = obj[oldKey];
                    delete obj[oldKey];
                });
            });

            totaldish = await decorationModel.count(finder);
        }

        
        let paginate = {
            "total_item": totaldish,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totaldish) / parseInt(req.body.per_page))
        }

        
        if (dish.length > 0 || decoration.length > 0) {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: { dish: OverallResult, paginate } })
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})


router.get('/getRandomDishList', async(req, res) => {
    let finder = {
        status: 1
    };
    finder[`name`] = {
        $in: ['Paneer Lababdar','Hariyali Kebab','Lachha Parathas','Paneer Tikka','Veg Spring Rolls','Lassi','Sandwich','Virgin Mojito','Pooris & Bedmis','French Fries','Chicken Tikka','Veg Hakka Noodles']
    };
    var newArray=[];
    try {
        const dish = await dishModel.find(finder);
        dish.forEach(element => {
            newArray.push({name:element.name,image:element.image}) 
        });
        if (dish.length > 0) {
            setTimeout(() => {
                return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: newArray })
            }, 1000);
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

module.exports = router;
