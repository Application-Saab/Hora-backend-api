const express = require("express");
const UserModel = require("../models/user");
const passportAuth = require("../store/passportAuth");
const commonFunction = require("../store/commonFunction");
const addressModel = require("../models/address");
let bcrypt = require("bcryptjs");
const router = express.Router();
let async = require("async");
const ConfigurationModel = require("../models/configuration");
const mealModel = require("../models/meal");
const ingredientModel = require("../models/ingredient");
const dishModel = require("../models/dish");
const orderModel = require("../models/order");
var ObjectId = require("mongoose").Types.ObjectId;
const notificationFunction = require("../store/notifications");
const cityServedModel = require("../models/city-served");
const cityServedLocalityModel = require("../models/city-served-locality");

router.post('/admin_signup', async (req, res, next) => {
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
      next(error);
    }
})

router.post("/admin_signin", async (req, res, next) => {
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
      return res.json({
        error: true,
        status: 503,
        message: "Admin Not Registered",
      });
    }

    const token = passportAuth.signToken(user);

    return res.json({
      error: false,
      status: 200,
      data: user,
      token,
    });
  } catch (error) {
      next(error);
  }
});

router.post("/admin_user_list", async (req, res, next) => {
  try {
    let {
      role,
      email,
      phone,
      _id,
      page,
      per_page,
      city,
      job_profile,
      performanceBadge,
    } = req.body;

    // Ensure page and per_page are valid numbers
    page = Number(page);
    per_page = Number(per_page);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(per_page) || per_page < 1) per_page = 20;

    // Build the query
    const finder = { status: { $ne: 2 } };

    if (role) finder.role = role;
    if (city) finder.city = city;
    if (job_profile && job_profile !== "all") finder.job_profile = job_profile;
    if (performanceBadge) finder.performanceBadge = performanceBadge;

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
      next(error);
  }
});

router.post("/update_user_status", async (req, res, next) => {
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
            1,
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
      next(error);
  }
});

router.post('/admin_user_update', async (req, res, next) => {
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
        next(error);
    }
})

router.get('/admin_user_details/:id', async (req, res, next) => {
    try {
     const data = await UserModel.findById(req.params.id).populate('userAppliance','_id name image').populate('userCuisioness','_id name image').populate('userDishArray','_id name image').populate('userServedLocalities','_id name ')
     return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    }
    catch (error) {
      next(error);
     }
})

router.post('/user_signup', async (req, res, next) => {
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
      password: "",
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
      is_veg,
    });

    const savedUser = await newUser.save();

    } catch (error) {
      next(error);
    }
});

router.post('/admin_user_address_list', async (req, res, next) => {
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
      next(error);
    }
});

router.post("/adminOrderList", async (req, res, next) => {
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
      {
        $lookup: {
          from: "eventinvites", // correct collection name
          let: { orderId: "$order_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$orderId", "$$orderId"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                orderId: 1,
                hostName: 1,
                eventType: 1,
              },
            },
          ],
          as: "eventData",
        },
      },
      //add this field for get the designType from decoration model
      {
        $lookup: {
          from: "decorations",
          let: { itemIds: "$items" },
          pipeline: [
            {
              $match: {
                $expr: { $in: [{ $toString: "$_id" }, "$$itemIds"] },
              },
            },
            {
              $project: {
                _id: 1,
                designType: 1,
              },
            },
          ],
          as: "decorationsData",
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
      next(error);
  }
});

router.post("/downloadOrderReport", async (req, res, next) => {
  try {
    const {
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

    const finder = {
      status: { $ne: 2 },
    };

    // Filters
    if (order_id) finder.order_id = Number(order_id);
    if (type) finder.type = Number(type);
    if (order_status) finder.order_status = Number(order_status);

    if (typeof status !== "undefined" && status !== "") {
      finder.status = Number(status);
    }

    if (phone_no) finder.phone_no = phone_no;
    if (order_taken_by) finder.order_taken_by = order_taken_by;
    if (online_phone_no) finder.online_phone_no = online_phone_no;
    if (order_locality) finder.order_locality = order_locality;
    if (toId) finder.toId = toId;

    if (
      userReviewRatingArray &&
      Array.isArray(userReviewRatingArray) &&
      userReviewRatingArray.length > 0
    ) {
      finder.userReviewRatingArray = {
        $in: userReviewRatingArray,
      };
    }

    // Created At Filter
    if (start_createdAt && end_createdAt) {
      finder.createdAt = {
        $gte: new Date(start_createdAt),
        $lte: new Date(end_createdAt),
      };
    } else if (createdAt) {
      const start = new Date(createdAt);
      const end = new Date(createdAt);
      end.setDate(end.getDate() + 1);

      finder.createdAt = {
        $gte: start,
        $lt: end,
      };
    }

    // Review Date
    if (review_date) {
      finder.review_date = new Date(review_date);
    }

    // Order Date
    if (start_date && end_date) {
      finder.order_date = {
        $gte: new Date(start_date),
        $lte: new Date(end_date),
      };
    } else if (order_date) {
      const start = new Date(order_date);
      const end = new Date(order_date);
      end.setDate(end.getDate() + 1);

      finder.order_date = {
        $gte: start,
        $lt: end,
      };
    }

    const orders = await orderModel.aggregate([
      {
        $match: finder,
      },

      // CUSTOMER
      {
        $lookup: {
          from: "users",
          localField: "fromId",
          foreignField: "_id",
          as: "customer",
        },
      },
      {
        $unwind: {
          path: "$customer",
          preserveNullAndEmptyArrays: true,
        },
      },

      // SUPPLIER
      {
        $lookup: {
          from: "users",
          let: {
            supplierId: {
              $convert: {
                input: "$toId",
                to: "objectId",
                onError: null,
                onNull: null,
              },
            },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$supplierId"],
                },
              },
            },
          ],
          as: "supplier",
        },
      },
      {
        $unwind: {
          path: "$supplier",
          preserveNullAndEmptyArrays: true,
        },
      },

      // DECORATION PRODUCTS
      {
        $lookup: {
          from: "decorations",
          let: {
            selectedItems: "$selecteditems",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$selectedItems"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                price: 1,
                collectionType: {
                  $literal: "Decoration",
                },
              },
            },
          ],
          as: "decorationProducts",
        },
      },

      // PHOTOGRAPHY PRODUCTS
      {
        $lookup: {
          from: "photographies",
          let: {
            selectedItems: "$selecteditems",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$selectedItems"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                price: 1,
                collectionType: {
                  $literal: "Photography",
                },
              },
            },
          ],
          as: "photographyProducts",
        },
      },

      // MERGE PRODUCTS
      {
        $addFields: {
          allProducts: {
            $concatArrays: ["$decorationProducts", "$photographyProducts"],
          },
        },
      },

      // ONE ROW PER PRODUCT
      {
        $unwind: {
          path: "$allProducts",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          _id: 0,

          orderMongoId: "$_id",
          order_id: 1,
          order_date: 1,
          createdAt: 1,
          order_time: 1,
          order_taken_by: 1,

          total_amount: 1,
          payable_amount: 1,
          advance_amount: 1,
          balance_amount: 1,

          eventName: 1,
          order_locality: 1,
          order_pincode: 1,

          status: {
            $cond: [{ $eq: ["$status", 1] }, "Active", "Inactive"],
          },

          order_status: 1,

          customer_id: "$customer._id",
          customer_name: "$customer.name",
          customer_phone: "$customer.phone",

          supplier_id: "$supplier._id",
          supplier_name: "$supplier.name",
          supplier_phone: "$supplier.phone",

          product_id: "$allProducts._id",
          product_name: "$allProducts.name",
          product_price: "$allProducts.price",
          product_collection: "$allProducts.collectionType",

          rating_range: {
            $arrayElemAt: ["$userReviewRatingArray", 0],
          },

          rating: {
            $switch: {
              branches: [
                {
                  case: {
                    $eq: [
                      {
                        $arrayElemAt: ["$userReviewRatingArray", 0],
                      },
                      "1-6",
                    ],
                  },
                  then: "Low",
                },
                {
                  case: {
                    $eq: [
                      {
                        $arrayElemAt: ["$userReviewRatingArray", 0],
                      },
                      "7-8",
                    ],
                  },
                  then: "Mid",
                },
                {
                  case: {
                    $eq: [
                      {
                        $arrayElemAt: ["$userReviewRatingArray", 0],
                      },
                      "9-10",
                    ],
                  },
                  then: "High",
                },
              ],
              default: "",
            },
          },
        },
      },

      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    return res.status(200).json({
      error: false,
      status: 200,
      message: "Report Generated Successfully",
      totalRecords: orders.length,
      data: orders,
    });
  } catch (error) {
      next(error);
  }
});

router.get("/getUserDetails/:id", async (req, res, next) => {
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
      next(error);
  }
});

module.exports = router;
