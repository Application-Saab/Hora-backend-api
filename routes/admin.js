const express = require('express');
const UserModel = require('../models/user');
const passportAuth= require('../store/passportAuth');
const commonFunction= require('../store/commonFunction');
const addressModel = require('../models/address');
let bcrypt = require('bcryptjs');
const router = express.Router();
let async = require('async');
const ConfigurationModel = require('../models/configuration');
const mealModel = require('../models/meal');
const ingredientModel = require('../models/ingredient');
const dishModel = require('../models/dish');
const orderModel = require('../models/order');
var ObjectId = require('mongoose').Types.ObjectId; 
const notificationFunction = require("../store/notifications");
const cityServedModel = require("../models/city-served");
const cityServedLocalityModel = require("../models/city-served-locality");

router.post('/admin_signup', async (req, res) => {
    const data = new UserModel({
        email: req.body.email,
        name: req.body.name,
        role: 'admin',
        password: req.body.password,
        phone: '',
        os: 'web',
        address: ''
    })
    try {
        bcrypt.hash(data.password, 10,async (err, hash) => {
            if (hash) {
                const user = await UserModel.find({ email: req.body.email, role: 'admin' });
                if(user.length>0){
                    return res.json({ error: false,status:503, message: 'Admin Already Added' })
                }else{
                    data.hashpassword = hash;
                    const dataToSave = await data.save();
                    return res.json({ error: false,status:200, message: 'Admin Registered Successfully', dataToSave })
                }
            }
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/admin_signin', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'email', message: 'Email is required.' },
                { path: 'password', message: 'Password is required.' }
            ]
        });
    }
    try {
        const user = await UserModel.find({ email: req.body.email, role: 'admin', password: req.body.password });
        if(user.length>0){
            return res.json({ error: false,status:200, data:user[0],token: passportAuth.signToken(user[0]) })
        }else{
            return res.json({ error: true,status:503, message: 'Admin Not Registered' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/admin_user_list', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    const { role } = req.body;
    if (role) {
        finder['role']= req.body.role;  
    }
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    if (req.body.email) {
        finder[`email`] = new RegExp((req.body.email).trim(), 'i') 
    }
    if (req.body.phone) {
        finder[`phone`] = new RegExp((req.body.phone).trim(), 'i') 
    }
    if (req.body._id) {
        finder['_id'] = new ObjectId(req.body._id.trim());
    }
    try {
        project = await { "name": 0, "email": 0, "phone": 0 };
        const users = await UserModel.aggregate(
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
        let OverallResult = users;
        const totalUsers = await UserModel.count(finder);
        let paginate = {
            "total_item": totalUsers,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalUsers) / parseInt(req.body.per_page))
        }
        if(users.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { users: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/update_user_status', async (req, res) => {
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
        const user = await UserModel.find({ _id: req.body._id });
        if(user.length>0){
            const update = {
                status: req.body.status
            };
            if(user[0].device_token != ""){
                if(req.body.status == 0){
                    notificationFunction.sendNotifications(user[0].device_token,req.body._id,'Account Blocked','Please reach out to below contact +91 888-422-1287',req.body.status,1)
                }else if(req.body.status == 2){
                    notificationFunction.sendNotifications(user[0].device_token,req.body._id,'Account Deleted','Please reach out to below contact +91 888-422-1287',req.body.status,1)
                }
            }
            const result = await UserModel.findByIdAndUpdate(user[0]._id, { $set: update })
            return res.json({ error: false,status:200, message:'Status Update Successfully' })
        }else{
            return res.json({ error: true,status:503, message: 'User Not Registered' })
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message,error: true })
    }
})

router.post('/admin_user_update', async (req, res) => {
    const id = req.body._id;
    const updatedData = req.body;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false,status:200, message: 'Updated Successfully', data:result})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/admin_user_details/:id', async (req, res) => {
    try {
     const data = await UserModel.findById(req.params.id).populate('userAppliance','_id name image').populate('userCuisioness','_id name image').populate('userDishArray','_id name image').populate('userServedLocalities','_id name ')
     return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
     res.status(400).json({ message: error.message ,error: true})
     }
})

router.post('/user_signup', async (req, res) => {
    const data = new UserModel({
        email: req.body.email,
        name: req.body.name,
        role: req.body.role,
        avatar: req.body.avatar,
        password: '',
        phone: req.body.phone,
        os: req.body.os,
        address: req.body.address,
        otp: req.body.otp,
        age: req.body.age,
        city: req.body.city,
        aadhar_no: req.body.aadhar_no,
        aadhar_front_img: req.body.aadhar_front_img,
        aadhar_back_img: req.body.aadhar_back_img,
        experience: req.body.experience,
        userAppliance: req.body.userAppliance,
        userServedLocalities: req.body.userServedLocalities,
        job_type: req.body.job_type,
        resume: req.body.resume,
        userCuisioness: req.body.userCuisioness,
        is_veg: req.body.is_veg,
    })
    try {
        const user = await UserModel.find({ phone: req.body.phone, role: req.body.role });
        if(user.length>0){
            return res.json({ error: true,status:503, message: `${commonFunction.capitalizeFirstLetter(data.role)}`+' Already Added' })
        }else{
            const dataToSave = await data.save();
            return res.json({ error: false,status:200, message: `${commonFunction.capitalizeFirstLetter(data.role)}`+' Registered Successfully', dataToSave,token: passportAuth.signToken(dataToSave)})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true})
    }
})

router.post('/admin_user_address_list', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 100;
    }
    finder['userId']= req.body._id; 
    console.log("finder",finder)
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

router.get('/getDashboardCount', async (req, res) => {
    async.parallel({
        total_customer: function(callback) {
            let query = { 'role': 'customer','status':'1' };
            UserModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_supplier: function(callback) {
            let query = { 'role': 'supplier','status':'1' };
            UserModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_cousine: function(callback) {
            let query = { 'type': 'cuisine','status':'1' };
            ConfigurationModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_appliance: function(callback) {
            let query = { 'type': 'appliance','status':'1' };
            ConfigurationModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_meal: function(callback) {
            let query = { 'status':'1' };
            mealModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_ingredient: function(callback) {
            let query = { 'status':'1' };
            ingredientModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_dish: function(callback) {
            let query = { 'status':'1' };
            dishModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_city: function(callback) {
            let query = { 'status':'1' };
            cityServedModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_city_locality: function(callback) {
            let query = { 'status':'1' };
            cityServedLocalityModel.count(query, function(err, count) {
                callback(err, count);
            })
        },total_order: function(callback) {
            let query = { 'status':'1' };
            orderModel.count(query, function(err, count) {
                callback(err, count);
            })
        }
    }, function(err, results) {
        return res.json({ 
            error: false, status:200, message: 'Fetch Data Successfully', data:{
                total_customer: results.total_customer,
                total_supplier: results.total_supplier,
                total_cousine: results.total_cousine,
                total_appliance: results.total_appliance,
                total_meal: results.total_meal,
                total_ingredient: results.total_ingredient,
                total_dish: results.total_dish,
                total_city: results.total_city,
                total_city_locality: results.total_city_locality,
                total_order: results.total_order,
            } 
        })
    });
})

router.post('/adminOrderList', async (req, res) => {
    let finder ={
        status: { $ne: 2 }
    };
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 100;
    }
    if (req.body.order_id) {
        finder['order_id'] = req.body.order_id;
    }
    if (req.body.type){
        finder['type'] = req.body.type;
    }
    if (req.body.order_status){
        finder['order_status'] = req.body.order_status;
    }
    if (req.body.status){
        finder['status'] = req.body.status;
    }
    if (req.body.phone_no){
        finder['phone_no'] = req.body.phone_no;
    }
    if (req.body.start_createdAt && req.body.end_createdAt) {
        finder['createdAt'] = {
            $gte: new Date(req.body.start_createdAt),
            $lte: new Date(req.body.end_createdAt)
        };
    } else if (req.body.createdAt) {
        const date = new Date(req.body.createdAt);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
    
        finder['createdAt'] = {
            $gte: date,
            $lt: nextDate
        };
    }    
    if (req.body.review_date){
        finder['review_date'] = new Date(req.body.review_date);
    }
    if (req.body.order_taken_by){
        finder['order_taken_by'] = req.body.order_taken_by;
    }
    if (req.body.online_phone_no){
        finder['online_phone_no'] = req.body.online_phone_no;
    }
    if (req.body.order_locality){
	finder['order_locality'] = req.body.order_locality;
    }
    if (req.body.toId){
        finder['toId'] = req.body.toId;
    }
   if (req.body.userReviewRatingArray && req.body.userReviewRatingArray.length > 0) {
    finder['userReviewRatingArray'] = { $in: req.body.userReviewRatingArray };
   }
 
   if (req.body.start_date && req.body.end_date) {
        finder['order_date'] = {
            $gte: new Date(req.body.start_date),
            $lte: new Date(req.body.end_date)
        };
    } else if (req.body.order_date) {
        finder['order_date'] = new Date(req.body.order_date);
    }


    try {
        // const order = await orderModel.find(finder).populate('fromId').populate('toId').populate('addressId');
        const order = await orderModel.aggregate(
            [
                { $match: finder },
                { $lookup: { from: 'addresses', localField: 'addressId', foreignField: '_id', as: 'addressId' } },
                // { $lookup: { from: 'users', localField: 'fromId', foreignField: '_id', as: 'fromId' } },
                { $sort: { order_id: -1 } },
                { $match: { "_id": { '$nin': [] } } },
                { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
                { $limit: Number(req.body.per_page) }
            ]
        );

        let OverallResult = order;
        const totalorder = await orderModel.count(finder);
        let paginate = {
            "total_item": totalorder,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalorder) / parseInt(req.body.per_page))
        }
        if(order.length>0){
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { order: OverallResult, paginate }})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.get('/getUserDetails/:id', async (req, res) => {
    try {
        var id = new ObjectId(req.params.id);
        const data = await UserModel.findById(id);
        return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

module.exports = router;
