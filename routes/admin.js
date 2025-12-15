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

router.post("/admin_signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({
        error: true,
        status: 422,
        data: [
          { path: "email", message: "Email is required." },
          { path: "password", message: "Password is required." },
        ],
      });
    }

    const user = await UserModel.findOne({ email, role: "admin", password });

    if (!user) {
      return res
        .json({ error: true, status: 503, message: "Admin Not Registered" });
    }

    const token = passportAuth.signToken(user);

    return res.json({
      error: false,
      status: 200,
      data: user,
      token,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});

router.post("/admin_user_list", async (req, res) => {
  try {
    let { role, email, phone, _id, page, per_page } = req.body;

    // Ensure page and per_page are valid numbers
    page = Number(page);
    per_page = Number(per_page);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(per_page) || per_page < 1) per_page = 20;

    // Build the query
    const finder = { status: { $ne: 2 } };

    if (role) finder.role = role;

    if (email) {
      finder.email = new RegExp(email.trim(), "i");
    }

    if (phone) {
      finder.phone = new RegExp(phone.trim(), "i");
    }

    if (_id) {
      finder._id = new ObjectId(_id.trim());
    }

    // Aggregation for user list
    const users = await UserModel.aggregate([
      { $match: finder },
      { $sort: { updatedAt: -1 } },
      { $match: { _id: { $nin: [] } } },
      { $skip: (page - 1) * per_page },
      { $limit: per_page },
    ]);

    const totalUsers = await UserModel.countDocuments(finder);

    const paginate = {
      total_item: totalUsers,
      showing: users.length,
      first_page: 1,
      previous_page: page > 1 ? page - 1 : null,
      current_page: page,
      next_page: page * per_page < totalUsers ? page + 1 : null,
      last_page: Math.ceil(totalUsers / per_page),
    };

    if (users.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Fetch Data Successfully",
        data: { users, paginate },
      });
    } else {
      return res.json({
        error: true,
        status: 503,
        message: "No Record Found",
      });
    }
  } catch (error) {
    res.status(400).json({
      error: true,
      message: error.message,
    });
  }
});

router.post("/update_user_status", async (req, res) => {
  const { _id } = req.body;

  if (!_id) {
    return res.json({
      error: true,
      status: 422,
      data: [{ path: "_id", message: "Id is required." }],
    });
  }

  try {
    const user = await UserModel.findOne({ _id: req.body._id });

    if (user) {
      const update = {
        status: req.body.status,
      };

      if (user.device_token !== "") {

        if (req.body.status == 2) {
          notificationFunction.sendNotifications(
            user.device_token,
            req.body._id,
            "Account Deleted",
            "Please reach out to below contact +91 888-422-1287",
            req.body.status,
            1
          );
        }
      }

      await UserModel.findByIdAndUpdate(user._id, { $set: update });

      return res.json({
        error: false,
        status: 200,
        message: "Status Update Successfully",
      });
    } else {
      return res.json({
        error: true,
        status: 503,
        message: "User Not Registered",
      });
    }
  } catch (error) {
    return res.status(400).json({
      message: error.message,
      error: true,
    });
  }
});

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
    try {
        const {
            email,
            name,
            role,
            avatar,
            phone,
            os,
            address,
            otp,
            age,
            city,
            aadhar_no,
            aadhar_front_img,
            aadhar_back_img,
            experience,
            userAppliance,
            userServedLocalities,
            job_type,
            resume,
            userCuisioness,
            is_veg
        } = req.body;

        // Check if user already exists
        const existingUser = await UserModel.find({ phone, role });

        if (existingUser.length > 0) {
            return res.json({
                error: true,
                status: 503,
                message: `${commonFunction.capitalizeFirstLetter(role)} Already Added`
            });
        }

        // Create new user
        const newUser = new UserModel({
            email,
            name,
            role,
            avatar,
            password: '',
            phone,
            os,
            address,
            otp,
            age,
            city,
            aadhar_no,
            aadhar_front_img,
            aadhar_back_img,
            experience,
            userAppliance,
            userServedLocalities,
            job_type,
            resume,
            userCuisioness,
            is_veg
        });

        const savedUser = await newUser.save();

        return res.json({
            error: false,
            status: 200,
            message: `${commonFunction.capitalizeFirstLetter(role)} Registered Successfully`,
            dataToSave: savedUser,   
            token: passportAuth.signToken(savedUser)
        });

    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
});

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

router.post("/adminOrderList", async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 100,
      order_id,
      type,
      order_status,
      status,
      phone_no,
      start_createdAt,
      end_createdAt,
      createdAt,
      review_date,
      order_taken_by,
      online_phone_no,
      order_locality,
      toId,
      userReviewRatingArray,
      start_date,
      end_date,
      order_date,
    } = req.body;

    // Build the query object
    const finder = { status: { $ne: 2 } };

    if (order_id) finder.order_id = order_id;
    if (type) finder.type = type;
    if (order_status) finder.order_status = order_status;
    if (status) finder.status = status;
    if (phone_no) finder.phone_no = phone_no;
    if (order_taken_by) finder.order_taken_by = order_taken_by;
    if (online_phone_no) finder.online_phone_no = online_phone_no;
    if (order_locality) finder.order_locality = order_locality;
    if (toId) finder.toId = toId;
    if (userReviewRatingArray && userReviewRatingArray.length > 0) {
      finder.userReviewRatingArray = { $in: userReviewRatingArray };
    }

    // Date filters
    if (start_createdAt && end_createdAt) {
      finder.createdAt = {
        $gte: new Date(start_createdAt),
        $lte: new Date(end_createdAt),
      };
    } else if (createdAt) {
      const start = new Date(createdAt);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      finder.createdAt = { $gte: start, $lt: end };
    }

    if (review_date) finder.review_date = new Date(review_date);

    if (start_date && end_date) {
      finder.order_date = {
        $gte: new Date(start_date),
        $lte: new Date(end_date),
      };
    } else if (order_date) {
      finder.order_date = new Date(order_date);
    }

    // Aggregation pipeline
    const order = await orderModel.aggregate([
      { $match: finder },
      {
        $lookup: {
          from: "addresses",
          localField: "addressId",
          foreignField: "_id",
          as: "addressId",
        },
      },
      { $sort: { order_id: -1 } },
      { $match: { _id: { $nin: [] } } },
      { $skip: (Number(page) - 1) * Number(per_page) },
      { $limit: Number(per_page) },
    ]);

    const totalorder = await orderModel.countDocuments(finder);

    const paginate = {
      total_item: totalorder,
      showing: order.length,
      first_page: 1,
      previous_page: page > 1 ? Number(page) - 1 : null,
      current_page: Number(page),
      next_page:
        Number(page) * Number(per_page) < totalorder ? Number(page) + 1 : null,
      last_page: Math.ceil(totalorder / Number(per_page)),
    };

    if (order.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Fetch Data Successfully",
        data: { order, paginate },
      });
    } else {
      return res.json({ error: true, status: 503, message: "No Record Found" });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});

router.get("/getUserDetails/:id", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);

    const data = await UserModel.findById(id);

    return res.json({
      error: false,
      status: 200,
      message: "Details Fetch Successfully",
      data: data,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
      error: true,
    });
  }
});

module.exports = router;
