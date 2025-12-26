const express = require('express');
const orderModel = require('../models/order');
const dishModel = require('../models/dish');
const userModel = require('../models/user');
const orderFeedbackModel = require('../models/order-feedback');
const commonFunction = require('../store/commonFunction');
const router = express.Router();
var async = require("async");
var ObjectId = require('mongoose').Types.ObjectId; 
const notificationFunction = require("../store/notifications");
const cityServedLocalityModel = require('../models/city-served-locality');
const cityServedModel = require('../models/city-served');
const decorationModel = require('../models/decoration');
const photographyModel = require('../models/photography')
// Load the full build.
var _ = require('lodash');
const AddressModel = require('../models/address');
const mongoose = require('mongoose');

router.post('/add_backup1', async(req, res) => {
    const otp = commonFunction.OTP();
    const totalorder = await orderModel.find({});
    const data = new orderModel({
        order_date: req.body.order_date,
        order_time: req.body.order_time,
        no_of_people: req.body.no_of_people,
        no_of_burner: req.body.no_of_burner,
        type: req.body.type,
        order_type: req.body.order_type,
        items: req.body.items,
        total_amount: req.body.total_amount,
        is_gst: req.body.is_gst,
        is_discount: req.body.is_discount,
        payable_amount: req.body.payable_amount,
        addressId: req.body.addressId,
        fromId: req.body.fromId,
        toId: req.body.toId,
        orderApplianceIds: req.body.orderApplianceIds,
        categoryIds: req.body.categoryIds,
        otp: otp,
        order_id: Number(totalorder.length)+1,
    })
    req.body.items.forEach(element => {
        data.selecteditems.push(element.item_id)
    });
    try {
        // var userArray=[];
        // const userIds= await userModel.find({role:'supplier'});
        // var i = 0;
        // async.eachSeries(userIds, function (rec2, loop2){
        //     userArray.push(rec2._id);
        //     loop2();
        //     i = i + 1;
        // });
        // data.supplierUserIds=userArray;
        const dataToSave = await data.save();
        return res.json({ error: false, status: 200, message: 'Order Created Successfully', data: dataToSave })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/add/v2', async(req, res) => {
    const totalorder = await orderModel.find({});
    const otp = commonFunction.OTP();
    const data = new orderModel({
        order_date: req.body.order_date,
        order_time: req.body.order_time,
        no_of_people: req.body.no_of_people,
        no_of_burner: req.body.no_of_burner,
        type: req.body.type,
        order_type: req.body.order_type,
        items: req.body.items,
        total_amount: req.body.total_amount,
        is_gst: req.body.is_gst,
        is_discount: req.body.is_discount,
        payable_amount: req.body.payable_amount,
        addressId: req.body.addressId,
        fromId: req.body.fromId,
        toId: req.body.toId,
        orderApplianceIds: req.body.orderApplianceIds,
        categoryIds: req.body.categoryIds,
        otp: otp,
        order_id: Number(totalorder.length)+1,
        order_locality: req.body.order_locality,
    })
    if(req.body.items.length>0){
        let hasKey = req.body.items[0].hasOwnProperty('item_id');
        if(hasKey){
            req.body.items.forEach(element => {
                data.selecteditems.push(element.item_id)
            });
        }else{
            req.body.items.forEach(element => {
                data.selecteditems.push(element)
            });
        }
    }
    try {
        var userArray=[];
        var userFinder = {  role:'supplier',device_token :{ "$nin": [ null, "" ] }  };
        var localityFinder = { status : 1}
        // localityFinder[`name`] = new RegExp((req.body.locality).trim(), 'i');
        const localityData= await cityServedLocalityModel.find(localityFinder);
        console.log("localityData>>>>>>",localityData);
        console.log("req.body.locality>>>>>>",req.body.locality);
        const localityIds= localityData.filter((x)=>String(x.name).toLowerCase() == String(req.body.order_locality).toLowerCase());
        console.log("localityIds>>>>>",localityIds)
        if(localityIds.length>0){
            userFinder[`userServedLocalities`]={ '$in': [ String(localityIds[0]._id) ] }
            const userIds= await userModel.find(userFinder);
            console.log("userIds>>>>>",userIds);
            var i = 0;
            async.eachSeries(userIds, function (rec2, loop2){
                userArray.push(rec2.device_token);
                loop2();
                i = i + 1;
            });
            if(userIds.length>0){
                if(userArray.length>0){
                    userArray.forEach(element => {
                        notificationFunction.sendNotifications(element,req.body.fromId,'New order','You have a new order!!!','',0)
                    });
                }
                let dishfinder = { status: 1 };
                var index = 0;
                let noOfChefHelper = 0;
                async.eachSeries(data.selecteditems, function (dish_elements, loop4){
                    let responseobject={};
                    dishfinder[`_id`]={ '$in': [ String(dish_elements) ] }
                    responseobject.mealObject=dish_elements;
                    (async () => {
                        await dishModel.find(dishfinder).exec(function(err, dishResponse) {
                            if(dishResponse.length>0){
                                noOfChefHelper=noOfChefHelper+Number(dishResponse[0].cooking_min);
                            }
                            loop4();
                            index = index + 1;
                        });
                    })();
                    
                }, async(errSelPro) => {
                    if(errSelPro){
                        return res.json({ error: true, status: 503, message: errSelPro })  
                    }else{
                        data.chef=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).chef;
                        data.helper=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).helper;
                        // console.log("data>>>>>>>>",JSON.stringify(data));
                        const dataToSave = await data.save();
                        // const dataToSave = data;
                        return res.json({ error: false, status: 200, message: 'Order Created Successfully', data: dataToSave })
                    }
                })
            }else{
                return res.json({ error: true, status: 503, message: 'No Supplier Are Available Right Now' })  
            }
        }else{
            return res.json({ error: true, status: 503, message: 'Sorry, we are not in your city!! We will notify you as soon we enter into the city.' }) 
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/add/v3', async(req, res) => {
    const totalorder = await orderModel.find({});
    const otp = commonFunction.OTP();
    const data = new orderModel({
        order_date: req.body.order_date,
        order_time: req.body.order_time,
        no_of_people: req.body.no_of_people,
        no_of_burner: req.body.no_of_burner,
        type: req.body.type,
        order_type: req.body.order_type,
        items: req.body.items,
        total_amount: req.body.total_amount,
        is_gst: req.body.is_gst,
        is_discount: req.body.is_discount,
        payable_amount: req.body.payable_amount,
        addressId: req.body.addressId,
        fromId: req.body.fromId,
        toId: req.body.toId,
        orderApplianceIds: req.body.orderApplianceIds,
        categoryIds: req.body.categoryIds,
        otp: otp,
        order_id: Number(totalorder.length)+1,
        order_locality: req.body.order_locality,
    })
    if(req.body.items.length>0){
        let hasKey = req.body.items[0].hasOwnProperty('item_id');
        if(hasKey){
            req.body.items.forEach(element => {
                data.selecteditems.push(element.item_id)
            });
        }else{
            req.body.items.forEach(element => {
                data.selecteditems.push(element)
            });
        }
    }
    try {
        var userArray=[];
        const orderAddress = await AddressModel.find({_id:req.body.addressId});
        var userFinder = {  role:'supplier',device_token :{ "$nin": [ null, "" ] }  };
        const userIds= await userModel.find(userFinder).populate('userServedLocalities');
        if(orderAddress.length>0){
            userIds.forEach(element => {
                var obj=[];
                obj.locationDistance=[]
                if(element.userServedLocalities && element.userServedLocalities.length>0){
                    element.userServedLocalities.forEach(location => {
                        obj.push(Number(commonFunction.getDistanceFromLatLonInKm(orderAddress[0].lat,orderAddress[0].lng,location.lat,location.lng).toFixed(2)))
                    });
                    userArray.push({_id:element._id,locationDistance:obj,device_token:element.device_token})
                }
            });
            if(userArray.length>0){
                let filteredArray = userArray.filter((element_recp) => { return element_recp.locationDistance.some((subElement) => subElement <= 0) });
                console.log("filteredArray>>>>>",filteredArray)
                // console.log("userArray>>>>>11111",JSON.stringify(userArray));
            }
        }
        let dishfinder = { status: 1 };
        var index = 0;
        let noOfChefHelper = 0;
        async.eachSeries(data.selecteditems, function (dish_elements, loop4){
            let responseobject={};
            dishfinder[`_id`]={ '$in': [ String(dish_elements) ] }
            responseobject.mealObject=dish_elements;
            (async () => {
                await dishModel.find(dishfinder).exec(function(err, dishResponse) {
                    if(dishResponse.length>0){
                        noOfChefHelper=noOfChefHelper+Number(dishResponse[0].cooking_min);
                    }
                    loop4();
                    index = index + 1;
                });
            })();
            
        }, async(errSelPro) => {
            if(errSelPro){
                return res.json({ error: true, status: 503, message: errSelPro })  
            }else{
                data.chef=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).chef;
                data.helper=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).helper;
                // console.log("data>>>>>>>>",JSON.stringify(data));
                const dataToSave = await data.save();
                // const dataToSave = data;
                return res.json({ error: false, status: 200, message: 'Order Created Successfully', data: dataToSave })
            }
        })

    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/add_backup', async(req, res) => {
    const totalorder = await orderModel.find({});
    const otp = commonFunction.OTP();
    const data = new orderModel({
        order_date: req.body.order_date,
        order_time: req.body.order_time,
        no_of_people: req.body.no_of_people,
        no_of_burner: req.body.no_of_burner,
        type: req.body.type,
        order_type: req.body.order_type,
        items: req.body.items,
        total_amount: req.body.total_amount,
        is_gst: req.body.is_gst,
        is_discount: req.body.is_discount,
        payable_amount: req.body.payable_amount,
        addressId: req.body.addressId,
        fromId: req.body.fromId,
        toId: req.body.toId,
        orderApplianceIds: req.body.orderApplianceIds,
        categoryIds: req.body.categoryIds,
        otp: otp,
        order_id: Number(totalorder.length)+1,
        order_locality: req.body.order_locality,
    })
    if(req.body.items.length>0){
        let hasKey = req.body.items[0].hasOwnProperty('item_id');
        if(hasKey){
            req.body.items.forEach(element => {
                data.selecteditems.push(element.item_id)
            });
        }else{
            req.body.items.forEach(element => {
                data.selecteditems.push(element)
            });
        }
    }
    try {
        var userArray=[];
        var userFinder = {  role:'supplier',device_token :{ "$nin": [ null, "" ] }  };
        var localityFinder = { status : 1}
        const localityData= await cityServedLocalityModel.find(localityFinder);
        console.log("localityData>>>>>>",localityData);
        console.log("req.body.locality>>>>>>",req.body.locality);
        const localityIds= localityData.filter((x)=>String(x.name).toLowerCase() == String(req.body.order_locality).toLowerCase());
        console.log("localityIds>>>>>",localityIds)
        const userIds= await userModel.find(userFinder);
        console.log("userIds>>>>>",userIds);
        var i = 0;
        async.eachSeries(userIds, function (rec2, loop2){
            userArray.push(rec2.device_token);
            loop2();
            i = i + 1;
        });
        if(userIds.length>0){
            if(userArray.length>0){
                userArray.forEach(element => {
                    notificationFunction.sendNotifications(element,req.body.fromId,'New order','You have a new order!!!','',0)
                });
            }
        }
        // if(localityIds.length>0){
        //     userFinder[`userServedLocalities`]={ '$in': [ String(localityIds[0]._id) ] }
        //     else{
        //         return res.json({ error: true, status: 503, message: 'No Supplier Are Available Right Now' })  
        //     }
        // }else{
        //     return res.json({ error: true, status: 503, message: 'Sorry, we are not in your city!! We will notify you as soon we enter into the city.' }) 
        // }

        let dishfinder = { status: 1 };
        var index = 0;
        let noOfChefHelper = 0;
        async.eachSeries(data.selecteditems, function (dish_elements, loop4){
            let responseobject={};
            dishfinder[`_id`]={ '$in': [ String(dish_elements) ] }
            responseobject.mealObject=dish_elements;
            (async () => {
                await dishModel.find(dishfinder).exec(function(err, dishResponse) {
                    if(dishResponse.length>0){
                        noOfChefHelper=noOfChefHelper+Number(dishResponse[0].cooking_min);
                    }
                    loop4();
                    index = index + 1;
                });
            })();
            
        }, async(errSelPro) => {
            if(errSelPro){
                return res.json({ error: true, status: 503, message: errSelPro })  
            }else{
                data.chef=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).chef;
                data.helper=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).helper;
                // console.log("data>>>>>>>>",JSON.stringify(data));
                const dataToSave = await data.save();
                // const dataToSave = data;
                return res.json({ error: false, status: 200, message: 'Order Created Successfully', data: dataToSave })
            }
        })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/add', async(req, res) => {
    const lastOrder = await orderModel.findOne().sort({ order_id: -1 }).select('order_id');
    const nextOrderId = lastOrder ? lastOrder.order_id + 1 : 1;
    const otp = commonFunction.OTP();
    const data = new orderModel({
        order_date: req.body.order_date,
        order_time: req.body.order_time,
        no_of_people: req.body.no_of_people,
        no_of_burner: req.body.no_of_burner,
        type: req.body.type,
        order_type: req.body.order_type,
        items: req.body.items,
        total_amount: req.body.total_amount,
        is_gst: req.body.is_gst,
        is_discount: req.body.is_discount,
        payable_amount: req.body.payable_amount,
        addressId: req.body.addressId,
        fromId: req.body.fromId,
        toId: req.body.toId,
        orderApplianceIds: req.body.orderApplianceIds,
        categoryIds: req.body.categoryIds,
        otp: otp,
        order_id: Number(nextOrderId),
        order_locality: req.body.order_locality,
        order_pincode: req.body.order_pincode,
        decoration_comments:req.body.decoration_comments,
	status:req.body.status,
	add_on:req.body.add_on,
	advance_amount:req.body.advance_amount,
	balance_amount:req.body.balance_amount,
        vendor_amount:req.body.vendor_amount,
	phone_no:req.body.phone_no,
	online_phone_no:req.body.online_phone_no,
	order_taken_by:req.body.order_taken_by,
    eventName:req.body.eventName,
    })
    if(req.body.items.length>0){
        let hasKey = req.body.items[0].hasOwnProperty('item_id');
        if(hasKey){
            req.body.items.forEach(element => {
                data.selecteditems.push(element.item_id)
            });
        }else{
            req.body.items.forEach(element => {
                data.selecteditems.push(element)
            });
        }
    }
    try {
        //var userArray=[];
        //var userSupplierIdsArray=[];
        //const orderAddress = await AddressModel.find({_id:req.body.addressId});
        //var userFinder = {  role:'supplier',device_token :{ "$nin": [ null, "" ] }  };
        //const userIds= await userModel.find(userFinder).populate('userServedLocalities');
        //console.log("Token User Token>>>",userIds.length)
        //if(orderAddress.length>0){
        //    userIds.forEach(element => {
        //        var obj=[];
        //        if(element.userServedLocalities && element.userServedLocalities.length>0){
        //            element.userServedLocalities.forEach(location => {
                       // obj.push(Number(commonFunction.getDistanceFromLatLonInKm(orderAddress[0].lat,orderAddress[0].lng,location.lat,location.lng)//.toFixed(2)))
        //            });
        //            userArray.push({_id:element._id,name:element.name,locationDistance:obj,device_token:element.device_token})
        //        }
        //    });
        //    if(userArray.length>0){
        //        console.log("userArray>>>>",JSON.stringify(userArray))
        //        let filteredArray = userArray.filter((element_recp) => { return element_recp.locationDistance.some((subElement) => subElement <= 10) });
        //       console.log("filteredArray>>>>>",filteredArray)
        //        if(filteredArray.length>0){
        //            filteredArray.forEach(element => {
        //                userSupplierIdsArray.push(element._id)
        //                notificationFunction.sendNotifications(element.device_token,req.body.fromId,'New order','You have a new order!!!','',0)
        //            });
        //        }
        //    }
        //}

               var userSupplierIdsArray = [];
               // Find all suppliers with device_token not null/empty
               var userFinder = { role: 'supplier', device_token: { "$nin": [null, ""] } };
               console.log("Finding suppliers with finder:", userFinder);
               const userIds = await userModel.find(userFinder);
               console.log("Total suppliers found with device_token:", userIds.length);

               // Get the order's locality, type, and status
               const orderLocality = req.body.order_locality || '';
               const orderType = req.body.type || '';
               const orderStatus = req.body.status;

               console.log("Order locality:", orderLocality, "Order type:", orderType, "Order status:", orderStatus);

               // Only send notifications to suppliers where:
               // order.order_locality == user.city
               // order.type == user.order_type
               // order.status == 1
               if (orderStatus == 1) {
                   let filteredSuppliers = userIds.filter(user => {
                       // user.city and user.order_type must exist
                       return (
                           user.city &&
                           user.order_type &&
                           user.city == orderLocality &&
                           user.order_type == orderType
                       );
                   });

                   console.log("Filtered suppliers matching locality and type:", filteredSuppliers.length);

                   if (filteredSuppliers.length > 0) {
                       filteredSuppliers.forEach(element => {
                           userSupplierIdsArray.push(element._id);
                           console.log(`Sending notification to supplier: ${element._id}, device_token: ${element.device_token}`);
                           notificationFunction.sendNotifications(
                               element.device_token,
                               req.body.fromId,
                               'New order',
                               'You have a new order!!!',
                               '',
                               0
                           );
                       });
                   } else {
                       console.log("No suppliers matched the locality and type for notification.");
                   }
               } else {
                   console.log("Order status is not 1, no notifications sent to suppliers.");
               }

        let dishfinder = { status: 1 };
        var index = 0;
        let noOfChefHelper = 0;
        async.eachSeries(data.selecteditems, function (dish_elements, loop4){
            let responseobject={};
            dishfinder[`_id`]={ '$in': [ String(dish_elements) ] }
            responseobject.mealObject=dish_elements;
            (async () => {
              const dishResponse = await dishModel.find(dishfinder);

                if (dishResponse.length > 0) {
                noOfChefHelper += Number(dishResponse[0].cooking_min);
                }

                loop4();
                index = index + 1;

            })();
            
        }, async(errSelPro) => {
            if(errSelPro){
                return res.json({ error: true, status: 503, message: errSelPro })  
            }else{
                data.chef=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).chef;
                data.helper=commonFunction.getCalcalutionOfChefAndHelper(noOfChefHelper).helper;
                //data.supplierUserIds=userSupplierIdsArray;
                const dataToSave = await data.save();
                // const dataToSave = data;
                return res.json({ error: false, status: 200, message: 'Order Created Successfully', data: dataToSave })
            }
        })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/edit', async (req, res) => {
  try {
    const id = req.body._id;

    const updatedData = { ...req.body };
    console.log("updatedData:", updatedData);

    const options = { new: true, runValidators: true }; // runValidators ensures schema validation

    const result = await orderModel.findByIdAndUpdate(id, updatedData, options);

    if (!result) {
      return res.status(404).json({ error: true, status: 404, message: 'Order not found' });
    }

    return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result });
  } catch (error) {
    console.error("Error updating order:", error);
    return res.status(400).json({ message: error.message, error: true });
  }
});

router.get('/details/:id', async(req, res) => {
    try {
        const data = await orderModel.findById(req.params.id).populate("categoryId")
        return res.json({ error: false, status: 200, message: 'Details Fetch Successfully', data: data })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_order_status', async (req, res) => {
  const { _id, status } = req.body;

  if (!_id) {
    return res.json({
      error: true,
      status: 422,
      data: [{ path: '_id', message: 'Id is required.' }]
    });
  }

  try {
    // Find the order by ID
    const order = await orderModel.findById(_id);

    if (!order) {
      return res.json({ error: true, status: 503, message: 'Details Not Found' });
    }

    // Update the status
    order.status = status;
    await order.save();

    // If status is 1, send notifications to suppliers
    if (status == 1) {
      try {
        const userSupplierIdsArray = [];
        const userFinder = { role: 'supplier', device_token: { $nin: [null, ""] } };
        console.log("Finding suppliers with finder:", userFinder);

        const suppliers = await userModel.find(userFinder);
        console.log("Total suppliers found with device_token:", suppliers.length);

        const orderLocality = order.order_locality || '';
        const orderType = order.type || '';

        const filteredSuppliers = suppliers.filter(user =>
          user.city && user.order_type && user.city === orderLocality && user.order_type === orderType
        );

        console.log("Filtered suppliers matching locality and type:", filteredSuppliers.length);
        if (filteredSuppliers.length > 0) {
        filteredSuppliers.forEach(supplier => {
          userSupplierIdsArray.push(supplier._id);
          console.log(`Sending notification to supplier: ${supplier._id}, device_token: ${supplier.device_token}`);
          notificationFunction.sendNotifications(
            supplier.device_token,
            order.fromId, // fromId from order
            'New order',
            'You have a new order!!!',
            '',
            0
          );
        });
}
         else {
          console.log("No suppliers matched the locality and type for notification.");
        }
      } catch (error) {
        
      }
    return res.json({ error: false, status: 200, message: 'Status Updated Successfully' });
    }

  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});

router.post('/order_list', async(req, res) => {
    let finder = {
        status: { $ne: 2 }
    };
    const { type } = req.body;
    if (type) {
        finder['type'] = Number(req.body.type);
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
        // const itemsss= { $in: body.skills };
        const order = await orderModel.aggregate(
            [
                { $match: finder },
                { $lookup: { from: 'addresses', localField: 'addressId', foreignField: '_id', pipeline: [{ $project: { _id: 0, status: 0, createdAt: 0, updatedAt: 0, __v: 0, userId: 0 } }], as: 'addressId' } },
                // { $lookup : { from: 'dishes',localField: 'items.item_id', foreignField: '_id',pipeline: [{ $project: {_id:0,status:0,createdAt:0,updatedAt:0,__v:0 } }], as: 'addressIdsssssss'}},
                { $sort: { updatedAt: -1 } },
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
        if (order.length > 0) {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: { order: OverallResult, paginate } })
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/order_details/:id', async(req, res) => {
    try {
        const order = await orderModel.findById(req.params.id).populate('addressId');
        order.items.forEach(element => {
            var obj = element;
            dishModel.findById(obj.item_id, function(err, result) {
                if (err) {
                    res.send(err);
                } else {
                    Object.assign(element, { result: result });
                }
            });
        });
        setTimeout(() => {
            if (Object.keys(order).length > 0) {
                return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: order })
            } else {
                return res.json({ error: true, status: 503, message: 'No Record Found' })
            }
        }, 1000);
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/order_details/v1/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const order = await orderModel.findById(id)
            .populate('addressId')
            .populate('fromId')
            .populate({
                path: 'selecteditems',
                populate: [
                    { path: 'cuisineId' },
                    { path: 'mealId' },
                    { path: 'special_appliance_id' },
                    { path: 'general_appliance_id' },
                    { path: 'serving_dish' }
                ]
            })
            .populate('orderApplianceIds')
            .exec(); // Recommended in Mongoose 9

        console.log("order>>>>>>>", order);

        if (order) {
            return res.status(200).json({
                error: false,
                status: 200,
                message: 'Fetch Data Successfully',
                data: order
            });
        } else {
            return res.status(503).json({
                error: true,
                status: 503,
                message: 'No Record Found'
            });
        }

    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error?.message || "Something went wrong"
        });
    }
});

router.post('/acceptOrder', async (req, res) => {
    const { requestdata } = req.body;

    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'Id is required.' }
            ]
        });
    }

    try {
        const order = await orderModel.findOne({ _id: req.body._id, order_status: 0 });

        if (order) {
            const update = {
                order_status: 1,
                toId: req.body.userId,
                // otp: otp,
            };

            const user = await userModel.findById(order.fromId);

            console.log("user>>>>", user);
            console.log("user>>>>Accept Order", user.device_token);

            if (user.device_token != "") {
                notificationFunction.sendNotifications(
                    user.device_token,
                    order.fromId,
                    'Accept order',
                    'Your order has been accepted !!',
                    req.body._id,
                    0
                );
            }

            const result = await orderModel.findByIdAndUpdate(
                order._id,
                { $set: update },
                { new: true } // To return the updated document
            );

            return res.json({
                error: false,
                status: 200,
                message: 'Order accepted successfully',
                data: result
            });
        } else {
            return res.json({
                error: true,
                status: 503,
                message: 'Order already accepted'
            });
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true });
    }
});

router.post('/startOrder', async (req, res) => {
    const { requestdata } = req.body;

    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [{ path: '_id', message: 'Id is required.' }]
        });
    }

    if (!req.body.otp) {
        return res.json({
            error: true,
            status: 422,
            data: [{ path: 'otp', message: 'otp is required.' }]
        });
    }

    try {
        const order = await orderModel.findOne({ _id: req.body._id });

        const order_otp = await orderModel.findOne({
            _id: req.body._id,
            otp: req.body.otp
        });

        if (order) {
            if (order_otp) {
                const update = {
                    order_status: 2,
                    toId: req.body.userId,
                    job_start_time: req.body.job_start_time
                };

                const result = await orderModel.findByIdAndUpdate(
                    order._id,
                    { $set: update },
                    { new: true } // return updated order
                );

                return res.json({
                    error: false,
                    status: 200,
                    message: 'Order started successfully',
                    data: result
                });

            } else {
                return res.json({
                    error: true,
                    status: 503,
                    message: 'otp mismatched'
                });
            }
        } else {
            return res.json({
                error: true,
                status: 503,
                message: 'Order already started'
            });
        }

    } catch (error) {
        res.status(400).json({ message: error.message, error: true });
    }
});

router.post('/completeOrder', async (req, res) => {
    const { _id, userId, job_end_time } = req.body;

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
        // Use findById for single document
        const order = await orderModel.findById(_id);

        if (!order) {
            return res.status(503).json({
                error: true,
                status: 503,
                message: 'No Order Found'
            });
        }

        // Prepare update
        const update = {
            order_status: 3,
            toId: userId,
            job_end_time,
            order_complete_date: new Date().getTime()
        };

        // Get user from fromId
        const user = await userModel.findById(order.fromId);

        // Send notification if device_token exists
        if (user?.device_token) {
            notificationFunction.sendNotifications(
                user.device_token,
                order.fromId,
                'Complete order',
                'Thanks!! Order is completed now !!',
                _id,
                0
            );
        }

        // Update order
        const result = await orderModel.findByIdAndUpdate(order._id, update, { new: true });

        return res.status(200).json({
            error: false,
            status: 200,
            message: 'Order completed successfully',
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
});

router.post('/publicOrderList/v2', async(req, res) => {
    let finder = { status: 1 };
    finder['toId'] = "";
    
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    try {
        console.log("finder>>>>",finder)
        const order = await orderModel.find(finder).sort({ order_date: -1}).populate('fromId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        });
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
        
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/order_view_details/:id', async(req, res) => {
    let responseobject={};
    try {
        const order = await orderModel.findById(req.params.id).populate('addressId').populate('fromId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "orderApplianceIds"
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        })
        var composedArray=[];
        var cuisine=[];
        var ingredient=[];
        console.log("Item",order.selecteditems.length)
        var newArrayyy = [];
        function groupValues(arr) {
            var res = [];
            arr.forEach((el, ind) => {
                var obj={};
                var adasdsad={};
                // console.log("el.cuisineId>>>>>",el.cuisineId);
                // obj=el.cuisineId.name;
                // cuisine.push(obj);
                el.cuisineId.forEach(cuisineelement => {
                    cuisine.push(cuisineelement.name);
                })
                // console.log("cuisine>>>>>>",cuisine);
                el.ingredientUsed.forEach(ingredientelement => {
                    ingredient.push({name:ingredientelement.name,image:ingredientelement.image});
                })
               var thisObj = this;
               var catIdsArray=[];
               catIdsArray=el.categoryIds;
                catIdsArray.forEach(element => {
                  if (!thisObj[element]) {
                     thisObj[element] = {
                        type: element,
                        value: []
                    }
                    res.push(thisObj[element]);
                    newArrayyy.push(thisObj[element]);
                  };
                  if (!thisObj[ind + '|' + element]) {
                     thisObj[element].value = thisObj[element].value.concat({name:el.name,image:el.image,_id:el._id});
                     thisObj[ind + '|' + element] = true;
                  };
                  if(thisObj[element]){
                    newArrayyy.push(thisObj[element])
                  }
                });
            }, {})
            return res;
        };
        composedArray.push(newArrayyy)
        console.log("groupValues(order.selecteditems)>>>>>>>",groupValues(order.selecteditems));
        // console.log("groupValues(order.selecteditems)>>>>>>>",JSON.stringify(order.selecteditems));
        var newGroupArray=[];
        setTimeout(() => {
            composedArray.forEach((element1)=>{
                element1.forEach((element2)=>{
                    element2.value.forEach((element3)=>{
                        newGroupArray.push({
                            category:element2.type,
                            name:element3.name,
                            image:element3.image,
                            _id:element3._id,
                        })
                    })
                });
                
            });

        }, 1000);
        // console.log("newGroupArray",newGroupArray);

        responseobject.order_id=order.order_id;
        responseobject.order_date=order.order_date;
        responseobject.order_time=order.order_time;
        responseobject.no_of_people=order.no_of_people;
        responseobject.no_of_burner=order.no_of_burner;
        responseobject.payable_amount=order.payable_amount;
        responseobject.addressId=order.addressId;
        responseobject.fromId=order.fromId;
        responseobject.order_status=order.order_status;
        responseobject.otp=order.otp;
        responseobject.createdAt=order.createdAt;
        responseobject.chef=order.chef;
        responseobject.helper=order.helper;
        responseobject.job_start_time=order.job_start_time;
        responseobject.userOrderDishImageArray=order.userOrderDishImageArray;
        responseobject.order_feedback=order.order_feedback;
        responseobject.job_end_time=order.job_end_time;
        responseobject.appliances=order.orderApplianceIds;
        responseobject.cuisine=[...new Set(cuisine)];
        const unique2 = ingredient.filter((obj, index) => {
            return index === ingredient.findIndex(o => obj.name === o.name);
        });
        responseobject.ingredient=unique2;
        setTimeout(() => {
            const unique2 = newGroupArray.filter((obj, index) => {
                return index === newGroupArray.findIndex(o => obj.name == o.name  && obj.category == o.category);
            });
            const result = unique2.reduce(function (r, a) {
                r[a.category] = r[a.category] || [];
                r[a.category].push(a);
                return r;
            }, Object.create(null));
            var covert  = Object.keys(result).map(function(key) { 
                return {'type':key,value:result[key]};  
            });
            responseobject.dishes=covert;
        if (Object.keys(order).length > 0) {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: responseobject })
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
        }, 3000);
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/getInProgressOrderList', async(req, res) => {
    let finder = {fromId:req.body.userId};
    finder[`order_status`] = {
        $in: [0,1,2]
    };
    finder[`status`] = 1;
    try {
        const complete_order = await orderModel.find({order_status:3,fromId:req.body.userId}).populate('fromId').populate('toId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "orderApplianceIds"
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        });
        const order = await orderModel.find(finder).populate('fromId').populate('toId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "orderApplianceIds"
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        }).sort({order_date:-1}).limit(2);
        if (order.length > 0 || complete_order.length > 0) {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: order,completeOrder:complete_order })
        } else {
            return res.json({ error: true, status: 503, message: 'No Record Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/add-order-feedback', async (req, res) => {
    const data = new orderFeedbackModel({
        slabPicture: req.body.slabPicture,
        sinkPicture: req.body.sinkPicture,
        gasBurnerPicture: req.body.gasBurnerPicture,
        kitchenPicture: req.body.kitchenPicture,
        floorPicture: req.body.floorPicture,
        familyPicture: req.body.familyPicture,
        no_of_people: req.body.no_of_people,
        ingredientRating: req.body.ingredientRating,
        bookingExperienceRating: req.body.bookingExperienceRating,
        customerBehaviourRating: req.body.customerBehaviourRating,
        additionalComments: req.body.additionalComments,
        orderId: req.body.orderId,
        isPaymentCollect: req.body.isPaymentCollect,
        userOrderDishImageArray: req.body.userOrderDishImageArray,
    })
    try {
        const update = {
            userOrderDishImageArray: req.body.userOrderDishImageArray,
        };
        const result = await orderModel.findByIdAndUpdate(req.body.orderId, { $set: update });
        const dataToSave = await data.save();
        return res.json({ error: false,status:200, message: 'Order Feedback Added Successfully', data:dataToSave})
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/order_status_list', async(req, res) => {
    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'User Id is required.' }
            ]
        });
    }
    let finder = {
        status: 1
    };
    finder['toId'] = req.body._id;
    if(req.body.order_status == 5){
        finder[`order_status`] = {
            $in: [1,2,3]
         };
    }else{
        finder['order_status'] = req.body.order_status;
    }
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    try {
        const order = await orderModel.find(finder).sort({ order_status: 1}).populate('fromId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        });
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
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/updateBookingDetails', async(req, res) => {
    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'Id is required.' }
            ]
        });
    }
    try {
        const order = await orderModel.find({ _id: req.body._id });
        if (order.length > 0) {
            const update = {
                userOrderDishImageArray: req.body.userOrderDishImageArray,
            };
            const result = await orderModel.findByIdAndUpdate(order[0]._id, { $set: update });
            console.log("result>>>>",result);
            return res.json({ error: false, status: 200, message: 'Order updated successfully',data:result })   
        } else {
            return res.json({ error: true, status: 503, message: 'No Order Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/createCustomerFeedback', async(req, res) => {
    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'Order Id is required.' }
            ]
        });
    }
    try {
        const order = await orderModel.find({ _id: req.body._id });
        if (order.length > 0) {
            let date_time = new Date();
            // get current hours
            let hours = date_time.getHours();
            // get current minutes
            let minutes = date_time.getMinutes();
            // get current seconds
            let seconds = date_time.getSeconds();
            console.log(hours + ":" + minutes + ":" + seconds);
            const update = {
                userReviewRatingArray: req.body.userReviewRatingArray,
                rateofCleanliness: req.body.rateofCleanliness,
                comments: req.body.comments,
                review_date: Date.now(),
                review_time: hours + ":" + minutes,
                order_feedback:"1"
            };
            const result = await orderModel.findByIdAndUpdate(order[0]._id, { $set: update });
            return res.json({ error: false, status: 200, message: 'Order Feedback update successfully',data:result })   
        } else {
            return res.json({ error: true, status: 503, message: 'No Order Found' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/user_review_list', async(req, res) => {
    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'User Id is required.' }
            ]
        });
    }
    let finder = { };
    finder['toId'] = String(req.body._id);
    try {
        var newArray=[];
        var average=0;
        const order = await orderModel.find(finder).sort({ order_date: -1}).populate('fromId').populate('addressId');
        console.log("order>>>>>",order);
        if(order.length>0){
            order.forEach((element)=>{
                if(element.rateofCleanliness){
                    newArray.push({
                        customer_name:element.fromId.name,
                        date:element.review_date,
                        time:element.review_time,
                        city:element.addressId? element.addressId.city:'',
                        rating:element.rateofCleanliness,
                        comments:element.comments,
                    })
                }
            })
        }
        if(newArray.length>0){
            newArray.forEach((element)=>{
                average = average+element.rating/newArray.length;
            })
            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: newArray,average:average.toFixed(2)})
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/cancelOrder', async (req, res) => {
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
        const order = await orderModel.findById(_id);

        if (!order) {
            return res.status(404).json({
                error: true,
                status: 503,
                message: 'No Order Found'
            });
        }

        order.order_status = 4; // Cancelled
        const result = await order.save(); // Save the updated document

        return res.status(200).json({
            error: false,
            status: 200,
            message: 'Order cancelled successfully',
            data: result
        });
    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
});

router.get('/booking_details/:id', async(req, res) => {
    let responseOrderObject={};
    try {
        const order = await orderModel.findById(req.params.id).populate('addressId').populate('fromId').populate('addressId').populate({
            path: "selecteditems",
            populate: {
               path: "cuisineId"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "mealId"
            }
        }).populate({
            path: "orderApplianceIds"
        }).populate({
            path: "selecteditems",
            populate: {
               path: "special_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "general_appliance_id"
            }
        }).populate({
            path: "selecteditems",
            populate: {
               path: "serving_dish"
            }
        });
        console.log("order>>>>>",order.selecteditems.length)
        responseOrderObject._id=order._id;
        responseOrderObject.order_date=order.order_date;
        responseOrderObject.order_time=order.order_time;
        responseOrderObject.job_start_time=order.job_start_time;
        responseOrderObject.job_end_time=order.job_end_time;
        responseOrderObject.no_of_people=order.no_of_people;
        responseOrderObject.no_of_burner=order.no_of_burner;
        responseOrderObject.total_amount=order.total_amount;
        responseOrderObject.payable_amount=order.payable_amount;
        responseOrderObject.addressId=order.addressId;
        responseOrderObject.fromId=order.fromId;
        responseOrderObject.toId=order.toId;
        responseOrderObject.order_status=order.order_status;
        responseOrderObject.otp=order.otp;
        responseOrderObject.order_id=order.order_id;
        responseOrderObject.orderApplianceIds=order.orderApplianceIds;
        responseOrderObject.chef=order.chef;
        responseOrderObject.helper=order.helper;
        responseOrderObject.rateofCleanliness=order.rateofCleanliness;
        responseOrderObject.userReviewRatingArray=order.userReviewRatingArray;
        responseOrderObject.userOrderDishImageArray=order.userOrderDishImageArray;
        responseOrderObject.review_date=order.review_date;
        responseOrderObject.review_time=order.review_time;
        responseOrderObject.createdAt=order.createdAt;
        responseOrderObject.updatedAt=order.updatedAt;
        responseOrderObject.appliances=order.orderApplianceIds;
        responseOrderObject.order_type=order.order_type;
        let optimizeArray=[];
        let cuisine=[];
        let ingredient=[];
        let newGroupArray=[];
        order.selecteditems.forEach(element1 => {
            element1.cuisineId.forEach(cuisineelement => {
                cuisine.push(cuisineelement.name);
            })
            element1.ingredientUsed.forEach(ingredientelement => {
                ingredient.push({name:ingredientelement.name,image:ingredientelement.image});
            });
            responseOrderObject.cuisine=[...new Set(cuisine)];
            const unique2 = ingredient.filter((obj, index) => {
                return index === ingredient.findIndex(o => obj.name === o.name);
            });
            responseOrderObject.ingredient=unique2;
            element1.mealId.forEach(element2 => {
                newGroupArray.push({
                    mastercategory:element2.name,
                    name:element1.name,
                    image:element1.image,
                    _id:element1._id,
                    is_dish:element1.is_dish,
                })
                let responseobject={};
                responseobject.name=element1.name;
                responseobject.image=element1.image;
                responseobject._id=element1._id;
                responseobject.is_dish=element1.is_dish;
                responseobject.description=element1.description;
                responseobject.dish_rate=element1.dish_rate;
                responseobject.price=element1.price;
                responseobject.ingredientUsed=element1.ingredientUsed;
                responseobject.serving_dish=element1.serving_dish;
                responseobject.special_appliance_id=element1.special_appliance_id;
                responseobject.general_appliance_id=element1.general_appliance_id;
                responseobject.isMealCategory=element2.name;
                optimizeArray.push(responseobject);
            });
        });
        console.log("newGroupArray>>>>>",JSON.stringify(newGroupArray));
        const uniqueArray2 = newGroupArray.filter((obj, index) => {
            return index === newGroupArray.findIndex(o => obj.name == o.name  && obj.mastercategory == o.mastercategory);
        });
        const result = uniqueArray2.reduce(function (r, a) {
            r[a.mastercategory] = r[a.mastercategory] || [];
            r[a.mastercategory].push(a);
            return r;
        }, Object.create(null));
        console.log("result>>>>>>",result);
        var covert  = Object.keys(result).map(function(key) { 
            return {'type':key,value:result[key]};  
        });
        responseOrderObject.dishes=covert;
        // console.log("optimizeArray>>>>>>",optimizeArray);
        // responseOrderObject.items=_.groupBy(optimizeArray, items => items.isMealCategory)
        setTimeout(() => {
            return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: responseOrderObject }) 
        }, 1000);
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/user_order_list', async(req, res) => {
    if (!req.body._id) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: '_id', message: 'User Id is required.' }
            ]
        });
    }

    let finder = {
        status: 1
    };

    let finderMany = { };

    finder['fromId'] = req.body._id;

    if (!req.body.page) {
        req.body.page = 1;
    }

    if (!req.body.per_page) {
        req.body.per_page = 20;
    }

    try {

        finderMany[`order_status`] = {
            $in: [1, 2]
        };

        const order = await orderModel.find(finder)
            .sort({ order_status: 1 })
            .populate('fromId')
            .populate('toId')
            .populate('addressId')
            .populate({
                path: "selecteditems",
                populate: {
                   path: "cuisineId"
                }
            })
            .populate({
                path: "selecteditems",
                populate: {
                   path: "mealId"
                }
            })
            .populate({
                path: "selecteditems",
                populate: {
                   path: "special_appliance_id"
                }
            })
            .populate({
                path: "selecteditems",
                populate: {
                   path: "general_appliance_id"
                }
            })
            .populate({
                path: "selecteditems",
                populate: {
                   path: "serving_dish"
                }
            })
            .populate({
                path: "orderApplianceIds"
            });

        let OverallResult = order;

        // ⭐ Mongoose 9 change: .count() → .countDocuments()
        const totalorder = await orderModel.countDocuments(finder);

        let paginate = {
            "total_item": totalorder,
            "showing": OverallResult.length,
            "first_page": 1,
            "previous_page": req.body.per_page,
            "current_page": req.body.page,
            "next_page": (parseInt(req.body.page) + 1),
            "last_page": parseInt((totalorder) / parseInt(req.body.per_page))
        }

        if(order.length > 0){
            return res.json({ 
                error: false,
                status: 200, 
                message: 'Fetch Data Successfully', 
                data: { order: OverallResult, paginate }
            });
        } else {
            return res.json({ 
                error: true, 
                status: 503, 
                message: 'No Record Found' 
            });
        }

    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
});

router.post('/publicOrderList/v1', async(req, res) => {
    const userId  = req.body.userId;
    if (!userId) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'userId', message: 'User Id is required.' }
            ]
        });
    }
    let finder = { status: 1 };
    finder['toId'] = "";
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    try {
        var userFinder = {  role:'supplier',_id :String(req.body.userId),status:1  };
        const user = await userModel.find(userFinder);
        var isUserLocalityIds=[];
        if(user.length>0){
            if(user[0].userServedLocalities.length>0){
                var i = 0;
                let cityServedfinder = { status: 1 };
                cityServedfinder[`_id`] = { $in: [] };
                async.eachSeries(user[0].userServedLocalities, function (rec1, loop1){
                    (async () => {
                        cityServedfinder[`_id`].$in.push( new ObjectId(rec1))
                        await cityServedLocalityModel.find(cityServedfinder).exec(function(err, cityServedResponse) {
                            if(cityServedResponse.length>0){
                                cityServedResponse.forEach(element => {
                                    isUserLocalityIds.push(element.name);
                                })
                            }
                            loop1();
                            i = i + 1;
                        });
                    })();
                }, async(errSelPro) => {
                    if(errSelPro){
                        return res.json({ error: true, status: 503, message: errSelPro })  
                    }else{
                        finder['order_locality'] = {
                            $in: isUserLocalityIds
                         };;
                        const order = await orderModel.find(finder).sort({ order_date: -1}).populate('fromId').populate('addressId').populate({ path: "selecteditems", populate: { path: "cuisineId" } }).populate({ path: "selecteditems", populate: { path: "mealId" } });

                        let OverallResult = order;
                        const totalorder = await orderModel.count(finder);
                        let paginate = { "total_item": totalorder, "showing": OverallResult.length, "first_page": 1, "previous_page": req.body.per_page, "current_page": req.body.page, "next_page": (parseInt(req.body.page) + 1), "last_page": parseInt((totalorder) / parseInt(req.body.per_page))
                        }
                        if(order.length>0){
                            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { order: OverallResult, paginate }})
                        }else{
                            return res.json({ error: true,status:503, message: 'No Record Found'})
                        }
                    }
                })
            }else{
                return res.json({ error: true,status:503, message: 'No Record Found'})
            }
        }else{
            return res.json({ error: true,status:503, message: 'Wrong User Id'})
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/publicOrderList/v2', async(req, res) => {
    const userId  = req.body.userId;
    if (!userId) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'userId', message: 'User Id is required.' }
            ]
        });
    }
    let finder = { status: 1 };
    finder['toId'] = "";
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    try {
        var userFinder = {  role:'supplier',_id :String(req.body.userId),status:1  };
        const user = await userModel.find(userFinder);
        var isUserLocalityIds=[];
        if(user.length>0){
            if(user[0].userServedLocalities.length>0){
                var i = 0;
                let cityServedfinder = { status: 1 };
                cityServedfinder[`_id`] = { $in: [] };
                async.eachSeries(user[0].userServedLocalities, function (rec1, loop1){
                    (async () => {
                        cityServedfinder[`_id`].$in.push( new ObjectId(rec1))
                        await cityServedLocalityModel.find(cityServedfinder).exec(function(err, cityServedResponse) {
                            if(cityServedResponse.length>0){
                                cityServedResponse.forEach(element => {
                                    isUserLocalityIds.push(element.name);
                                })
                            }
                            loop1();
                            i = i + 1;
                        });
                    })();
                }, async(errSelPro) => {
                    if(errSelPro){
                        return res.json({ error: true, status: 503, message: errSelPro })  
                    }else{
                        finder['order_locality'] = {
                            $in: isUserLocalityIds
                         };;
                        const order = await orderModel.find(finder).sort({ order_date: -1}).populate('fromId').populate('addressId').populate({ path: "selecteditems", populate: { path: "cuisineId" } }).populate({ path: "selecteditems", populate: { path: "mealId" } });

                        let OverallResult = order;
                        const totalorder = await orderModel.count(finder);
                        let paginate = { "total_item": totalorder, "showing": OverallResult.length, "first_page": 1, "previous_page": req.body.per_page, "current_page": req.body.page, "next_page": (parseInt(req.body.page) + 1), "last_page": parseInt((totalorder) / parseInt(req.body.per_page))
                        }
                        if(order.length>0){
                            return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { order: OverallResult, paginate }})
                        }else{
                            return res.json({ error: true,status:503, message: 'No Record Found'})
                        }
                    }
                })
            }else{
                return res.json({ error: true,status:503, message: 'No Record Found'})
            }
        }else{
            return res.json({ error: true,status:503, message: 'Wrong User Id'})
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/getOrderCityCheck', async(req, res) => {
    let finder ={ status: 1 };
    try {
        const city_served = await cityServedModel.find(finder);
        console.log("city_served>>>>",city_served);
        if(city_served.length>0){
            const citys= city_served.filter((x)=>String(x.name).toLowerCase() == String(req.body.name).toLowerCase());
            if(citys.length>0){
                return res.json({ error: false,status:200, message: 'Success', data: true})
            }else{
                return res.json({ error: false,status:200, message: 'Sorry, we are not in your city!! We will notify you as soon we enter into the city.', data: false})
            }
        }else{
            return res.json({ error: true,status:503, message: 'No City Found'})
        }
    }
    catch (error) {
        res.status(400).json({ message: error.message ,error: true })
    }
})

router.post('/publicOrderList', async(req, res) => {
    let finder = { status: 1 };
    finder['toId'] = "";
    
    if (!req.body.page) {
        req.body.page = 1;
    }
    if (!req.body.per_page) {
        req.body.per_page = 20;
    }
    try {
        console.log("finder>>>>",finder)
        if (req.body.userId) {
            finder[`supplierUserIds`]={  $in: [ new ObjectId(req.body.userId) ] }
            const userFinder=await userModel.find({_id:new ObjectId(req.body.userId)});
            // finder[`addressId.city`]='Bhopal';
            // console.log("userFinder",JSON.stringify(userFinder))
            const order = await orderModel.find(finder).sort({ order_date: -1}).populate('fromId').populate('addressId').populate({path: "selecteditems",populate: { path: "cuisineId" } }).populate({ path: "selecteditems", populate: { path: "mealId" } }).populate({ path: "selecteditems", populate: { path: "special_appliance_id" } }).populate({ path: "selecteditems", populate: { path: "general_appliance_id" } }).populate({ path: "selecteditems", populate: { path: "serving_dish" } });

            let OverallResult = order;
            const totalorder = await orderModel.count(finder);
            
            let paginate = { "total_item": totalorder, "showing": OverallResult.length, "first_page": 1, "previous_page": req.body.per_page, "current_page": req.body.page, "next_page": (parseInt(req.body.page) + 1), "last_page": parseInt((totalorder) / parseInt(req.body.per_page)) }

            if(order.length>0){
                return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { order: OverallResult, paginate }})
            }else{
                return res.json({ error: true,status:503, message: 'No Record Found'})
            }
        }else{
            return res.json({ error: true,status:503, message: 'No Record Found'})
        }
        
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/getIngredientByOrder/:id', async (req, res) => {
    try {
        const order = await orderModel
            .find({ order_id: req.params.id })
            .populate('addressId')
            .populate('fromId')
            .populate('addressId')
            .populate({
                path: "selecteditems",
                populate: { path: "cuisineId" }
            })
            .populate({
                path: "selecteditems",
                populate: { path: "mealId" }    
            })
            .populate({ path: "orderApplianceIds" })
            .populate({
                path: "selecteditems",
                populate: { path: "special_appliance_id" }
            })
            .populate({
                path: "selecteditems",
                populate: { path: "general_appliance_id" }
            })
            .populate({
                path: "selecteditems",
                populate: { path: "serving_dish" }
            });

        const hashMap = {};
        const noOfPeople = order[0].no_of_people;

        order[0].selecteditems.forEach(item => {
            if (item.ingredientUsed && Array.isArray(item.ingredientUsed)) {
                item.ingredientUsed.forEach(ingredient => {
                    const { name, image, unit, qty } = ingredient;
                    const qtyValue = parseFloat(qty);

                    if (!isNaN(qtyValue)){
					if (hashMap.hasOwnProperty(name)){
						hashMap[name].qty=hashMap[name].qty + qtyValue * noOfPeople
                        hashMap[name].count = hashMap[name].count + 1
					}
					else{
						hashMap[name]={qty:qtyValue * noOfPeople, unit, image, count:1}
					}
				}
                });
            }
        });

        for (const key in hashMap) {
            if (hashMap.hasOwnProperty(key)) {
              const value = hashMap[key];
              
              if (value.count == 4)
                {
                    value.qty = value.qty * 0.7
                }
                else if (value.count == 5)
                {
                    value.qty = value.qty * 0.6
                }
                else if (value.count == 6)
                {
                    value.qty = value.qty * 0.5
                }
                else if (value.count == 7)
                {
                    value.qty = value.qty * 0.4
                }
                else if (value.count == 8)
                {
                    value.qty = value.qty * 0.35
                }
                else if (value.count == 9)
                {
                    value.qty = value.qty * 0.3
                }
                else if (value.count == 10)
                {
                    value.qty = value.qty * 0.28
                }
                else if (value.count == 11)
                {
                    value.qty = value.qty * 0.25
                }

              if (value.qty > 1000)
              {
                value.qty = value.qty / 1000
                if (value.unit == 'Gram' || value.unit == 'gram')
                    value.unit = 'KG'
                else 
                    value.unit = 'L'
              }
            }
        }
        if (Object.keys(hashMap).length > 0) {
            return res.json({
                error: false,
                status: 200,
                message: 'Fetch Data Successfully',
                data: hashMap
            });
        } else {
            return res.json({
                error: true,
                status: 503,
                message: 'No Record Found'
            });
        }
    } catch (error) {
        return res.status(400).json({
            message: error.message,
            error: true
        });
    }
});

// Decoration Order Details
router.get('/order_details_decoration/:id', async (req, res) => {
  try {
    const order = await orderModel
      .findOne({ order_id: req.params.id })
      .populate('addressId')
      .populate('fromId')
      .exec();

    if (!order) {
      return res.status(404).json({ error: true, status: 404, message: 'No Record Found' });
    }

    const decorationDocs = await Promise.all(
      order.items.map(itemId => decorationModel.findById(itemId).exec())
    );

    const orderWithDecorations = {
      ...order.toObject(),
      items: order.items.map((itemId, idx) => ({
        itemId,
        decoration: decorationDocs[idx] ?? null
      }))
    };

    console.log('%c [OrderWithDecorations]', orderWithDecorations);

    return res.json({
      error: false,
      status: 200,
      message: 'Fetch Data Successfully',
      data: orderWithDecorations
    });

  } catch (err) {
    console.error('Error fetching order + decorations:', err);
    return res.status(500).json({ error: true, status: 500, message: err.message });
  }
});

router.get('/order_details_food_delivery/:id', async (req, res) => {
  try {
    const order = await orderModel
      .find({ order_id: req.params.id })
      .populate('addressId')
      .populate('fromId')
      .populate({
        path: 'selecteditems',
        populate: [
          { path: 'cuisineId' },
          { path: 'mealId' }
        ]
      });

    if (!order?.length) {
      return res.json({ error: true, status: 503, message: 'No Record Found' });
    }

    const orderData = order[0];

    const dishObject = Object.values(orderData.selecteditems).filter(x =>
      x._id.toString() !== "641540d58c62c01319fcccae" &&
      x._id.toString() !== "641540da8c62c01319fccef8"
    );

    const noOfPeople = orderData.no_of_people;
    const noOfBurner = orderData.no_of_burner;

    const itemCount = dishObject.filter(x =>
      ["63f1b6b7ed240f7a09f7e2de", "63f1b39a4082ee76673a0a9f", "63edc4757e1b370928b149b3"]
        .includes(x.mealId[0]._id.toString())
    ).length;

    let foodItems = [];

    for (const x of Object.values(orderData.selecteditems)) {
      let quantity = x.cuisineArray[1] * noOfPeople;
      const allowedMeals = ["63f1b6b7ed240f7a09f7e2de", "63f1b39a4082ee76673a0a9f", "63edc4757e1b370928b149b3"];

      if (
        x._id.toString() !== "641540d58c62c01319fcccae" &&
        x._id.toString() !== "641540da8c62c01319fccef8" &&
        allowedMeals.includes(x.mealId[0]?._id.toString())
      ) {
        if (itemCount === 4) quantity *= 1.15;
        else if ([6, 7].includes(itemCount)) quantity *= 0.85;
        else if (itemCount === 8) quantity *= 0.75;
        else if ([9, 10].includes(itemCount)) quantity *= 0.65;
        else if (itemCount === 11) quantity *= 0.60;
        else if ([12, 13].includes(itemCount)) quantity *= 0.50;
        else if (itemCount === 14) quantity *= 0.47;
        else if (itemCount === 15) quantity *= 0.45;
      }

      quantity = Math.round(quantity);
      let unit = x.cuisineArray[2];

      if (quantity >= 1000) {
        quantity /= 1000;
        if (unit === 'Gram') unit = 'KG';
        else if (unit === 'ml') unit = 'L';
      }

      foodItems.push({
        [x.name]: {
          price: x.cuisineArray[0],
          quantity,
          unit
        }
      });
    }

    foodItems.push({
      "water/disposal": {
        quantity: noOfBurner * noOfPeople,
        unit: null
      }
    });

    orderData.userOrderDishImageArray = Object.assign({}, ...foodItems);

    return res.json({
      error: false,
      status: 200,
      message: 'Fetch Data Successfully',
      data: orderData
    });

  } catch (error) {
    return res.status(400).json({ message: error.message, error: true });
  }
});

router.get('/order_details_photography/:id', async (req, res) => {
    try {
        const order = await orderModel.find({ order_id: req.params.id })
            .populate('addressId')
            .populate('fromId')
            .populate('addressId')
            .exec(); // Recommended for Mongoose 9

        let photography;
        let orderWithPhotography;

        if (order.length > 0) {
            const photographyPromisesArray = order.map(async (orderItem) => {
                const photographyPromises = orderItem.items.map(async (itemId) => {
                    return await photographyModel.findById(itemId).exec(); // Mongoose 9 safe
                });
                return await Promise.all(photographyPromises);
            });

            // Resolve all promises
            photography = await Promise.all(photographyPromisesArray);

            orderWithPhotography = {
                ...order[0]._doc, // Mongoose 9 returns document object safely
                items: order[0].items.map((itemId, index) => ({
                    itemId: itemId,
                    photography: photography[0][index] // keep same structure
                }))
            };
        }

        if (order.length > 0) {
            return res.json({
                error: false,
                status: 200,
                message: 'Fetch Data Successfully',
                data: orderWithPhotography
            });
        } else {
            return res.json({
                error: true,
                status: 503,
                message: 'No Record Found'
            });
        }

    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error?.message || "Something went wrong"
        });
    }
});

// PUT /api/order/updateImageTags  (images on website, not on the website)
router.put("/updateImageTags", async (req, res) => {
  try {
    const { orderId, images } = req.body;

    if (!orderId || !Array.isArray(images)) {
      return res.status(400).json({
        error: true,
        status: 400,
        message: "orderId and images array are required",
      });
    }

    const order = await orderModel.findOne({ order_id: orderId });
    if (!order) {
      return res.status(404).json({
        error: true,
        status: 404,
        message: "Order not found",
      });
    }

    // map frontend images by image name (SAFE)
    const tagMap = new Map();
    images.forEach(img => {
      if (img.image) {
        tagMap.set(img.image, img.is_tagged);
      }
    });

    order.userOrderDishImageArray = order.userOrderDishImageArray.map(dbImg => {

      if (typeof dbImg === "string") {
        if (tagMap.has(dbImg)) {
          return {
            id: new mongoose.Types.ObjectId(),
            image: dbImg,
            is_tagged: tagMap.get(dbImg)
          };
        }
        return dbImg;
      }

      if (dbImg.image && tagMap.has(dbImg.image)) {
        return {
          ...dbImg,
          is_tagged: tagMap.get(dbImg.image)
        };
      }

      return dbImg;
    });

    await order.save();

    return res.status(200).json({
      error: false,
      status: 200,
      message: "Image tag updated successfully",
      data: order.userOrderDishImageArray,
    });

  } catch (err) {
    return res.status(500).json({
      error: true,
      status: 500,
      message: err.message,
    });
  }
});

module.exports = router;

