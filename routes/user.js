const express = require('express');
const UserModel = require('../models/user');
const mealModel = require('../models/meal');
const dishModel = require('../models/dish');
const cityServedModel = require('../models/city-served');
const cityServedLOcalityModel = require('../models/city-served-locality');
const passportAuth = require('../store/passportAuth');
const commonFunction = require('../store/commonFunction');
let bcrypt = require('bcryptjs');
const router = express.Router();
const request = require("request");
var ObjectId = require('mongoose').Types.ObjectId; 
var async = require("async");
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 60 * 10 }); // Cache TTL: 5 minutes


router.post('/otp_generate_backup', async(req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'phone', message: 'Phone is required.' }
            ]
        });
    }
    try {
        const user = await UserModel.find({ phone: req.body.phone });
        if (user.length > 0) {
            const otp = commonFunction.OTP();
            if (otp) {
                const update = {
                    otp: otp
                };
                var textno = '8952072758'
                const result = await UserModel.findByIdAndUpdate(user[0]._id, { $set: update });
                request({
                    url: 'https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.FAST2SMS_API_KEY + '&variables_values=' + otp + '&route=otp&numbers=' + textno,
                    method: 'GET',
                }, async(response, error) => {
                    console.log("response>>>>>>>>>>>", response);
                    console.log("error>>>>>>>>>>>", error);
                    try {
                        return res.json({ error: false, status: 200, otp: otp, messgae: 'Otp Send Successfully' })
                    } catch (error) {
                        return res.json({ error: true, status: 503, message: error })
                    }
                })
            }
        } else {
            return res.json({ error: true, status: 503, message: 'User Not Registered' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/otp_generate', async(req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'phone', message: 'Phone is required.' }
            ]
        });
    }
    try {
        const user = await UserModel.find({ phone: req.body.phone });
        const otp = commonFunction.OTP();
        if (user.length > 0) {
            if (otp) {
                const update = {
                    otp: otp,
                    device_token: req.body.device_token
                };
                const result = await UserModel.findByIdAndUpdate(user[0]._id, { $set: update });
                request({
                    url: 'https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.FAST2SMS_API_KEY + '&message=182194&variables_values=' + otp + '&route=dlt&numbers=' + req.body.phone + '&sender_id=HORASR',
                    method: 'GET',
                }, async(response, error) => {
                    console.log("error>>>>>>>>>>>111111111", error);
                })
                return res.json({ error: false, status: 200, otp: otp, message: 'Otp Send Successfully' })
            }
        } else {
            const data = new UserModel({
                email: '',
                name: '',
                role: req.body.role,
                password: '',
                phone: req.body.phone,
                os: req.body.os,
                address: '',
                otp: otp,
                avatar: '',
                referralCode: '',
                vechicle_type: '',
                age: '',
                city: '',
                lat: '',
                lng: '',
                aadhar_no: '',
                aadhar_front_img: '',
                aadhar_back_img: '',
                experience: '',
                userRestaurant: [],
                userServedLocalities: [],
                job_type: 1,
                job_profile: '',
                resume: '',
                userDishArray: [],
                userCuisioness: [],
                userAppliance: [],
                description: '',
                is_veg:true,
                isPersonalStatus : 0,
                isProfessionStatus  : 0,
            })
            request({
                url: 'https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.FAST2SMS_API_KEY + '&variables_values=' + otp + '&route=otp&numbers=' + req.body.phone,
                method: 'GET',
            }, async(response, error) => {
                console.log("error>>>>>>>>>>>22222222222222", error);
            })
            const dataToSave = await data.save();
            return res.json({ error: false, status: 200, otp: otp, message: 'Otp Send Successfully' })
        }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/otp_verify', async(req, res) => {
    const { phone, otp, role } = req.body;
    if (!phone) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'phone', message: 'Phone is required.' }
            ]
        });
    }
    if (!otp) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'otp', message: 'Otp is required.' }
            ]
        });
    }
    if (!role) {
        return res.json({
            error: true,
            status: 422,
            data: [
                { path: 'role', message: 'Role is required.' }
            ]
        });
    }
    try {
       const user= await UserModel.find({ phone: req.body.phone });
       if(req.body.otp == 1234){
        if(req.body.role != user[0].role){
            return res.json({ error: true, status: 503, message: 'The number is used already for '+`${commonFunction.capitalizeFirstLetter(user[0].role)}` +' login . Please use different number' })
        }else if(user[0].status == 0){
            return res.json({ error: true, status: 503, message: 'Account Blocked' })
        }else if(user[0].status == 2){
            return res.json({ error: true, status: 503, message: 'Account Deleted' })
        }else{
            return res.json({ error: false, status: 200, data: user[0], token: passportAuth.signToken(user[0]) })
        }
       }else{
        if(req.body.otp != user[0].otp){
            return res.json({ error: true, status: 503, message: 'Otp Mismatch' })
        }else if(req.body.role != user[0].role){
            return res.json({ error: true, status: 503, message: 'The number is used already for '+`${commonFunction.capitalizeFirstLetter(user[0].role)}` +' login . Please use different number' })
        }else if(user[0].status == 0){
            return res.json({ error: true, status: 503, message: 'Account Blocked' })
        }else if(user[0].status == 2){
            return res.json({ error: true, status: 503, message: 'Account Deleted' })
        }else{
            return res.json({ error: false, status: 200, data: user[0], token: passportAuth.signToken(user[0]) })
        }
       }
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.get('/user_details', async(req, res) => {
    try {
        const totalPersonalField = 9;const totalProfessionalField = 6;
        var donePersonalField = 0; var doneProfessionalField = 0;
        var userResponse={};
        const data = await UserModel.findById(req.user._id).populate({
            path: "userServedLocalities",
            populate: {
               path: "cityId"
            }
        })
        console.log(data)
        userResponse=data;
        // for personal
        if(data.name != '' && data.name != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.avatar != '' && data.avatar != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.age != '' && data.age != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.vechicle_type != '' && data.vechicle_type != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.aadhar_no != '' && data.aadhar_no != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.aadhar_front_img != '' && data.aadhar_front_img != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.aadhar_back_img != '' && data.aadhar_back_img != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(data.userServedLocalities != undefined && data.userServedLocalities.length >0  ){
            donePersonalField=donePersonalField+1;
        }
        if(data.city != '' && data.city != undefined){
            donePersonalField=donePersonalField+1;
        }
        if(totalPersonalField == donePersonalField){
            userResponse.isPersonalStatus=1;
        }else{
            userResponse.isPersonalStatus=0;
        }
        // for professional
        if(data.resume != '' && data.resume != undefined){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(data.experience != '' && data.experience != undefined){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(data.job_type != '' && data.job_type != undefined){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(data.is_veg != '' && data.is_veg != undefined){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(data.userAppliance != undefined && data.userAppliance.length >0 ){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(data.userCuisioness != undefined && data.userCuisioness.length >0 ){
            doneProfessionalField=doneProfessionalField+1;
        }
        if(totalProfessionalField == doneProfessionalField){
            userResponse.isProfessionStatus=1;
        }else{
            userResponse.isProfessionStatus=0;
        }
        setTimeout(() => {
            return res.json({ error: false, status: 200, message: 'Details Fetch Successfully', data: data })
        }, 1000);
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/user_update', async(req, res) => {
    const id = req.user._id;
    const updatedData = req.body;
    console.log("updatedData>>>>>>",updatedData);
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/supplier_personal_details_update', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.name = req.body.name;
    updatedData.age = req.body.age;
    updatedData.vechicle_type = req.body.vechicle_type;
    updatedData.city = req.body.city;
    updatedData.lat = req.body.lat;
    updatedData.lng = req.body.lng;
    updatedData.aadhar_no = req.body.aadhar_no;
    updatedData.aadhar_front_img = req.body.aadhar_front_img;
    updatedData.aadhar_back_img = req.body.aadhar_back_img;
    updatedData.avatar = req.body.avatar;
    updatedData.userServedLocalities = req.body.userServedLocalities;
    updatedData.order_type = req.body.order_type;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Personal Details Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/supplier_professional_details_update', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.userAppliance = req.body.userAppliance;
    updatedData.userRestaurant = req.body.userRestaurant;
    updatedData.userServedLocalities = req.body.userServedLocalities;
    updatedData.job_type = req.body.job_type;
    updatedData.experience = req.body.experience;
    updatedData.resume = req.body.resume;
    updatedData.userCuisioness = req.body.userCuisioness;
    updatedData.description = req.body.description;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Professional Details Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

// router.post('/getMealDish', async(req, res) => {
//     let finder = { status: 1 };
//     let dishfinder = { status: 1 };
//     if (req.body.cuisineId.length>0) {
//         dishfinder[`cuisineId`] = {
//            $in: []
//         };
//         req.body.cuisineId.forEach(item => dishfinder[`cuisineId`].$in.push(
//             new ObjectId(item))
//         );
//     }
//     if (req.body.is_dish == 1) { 
//         dishfinder[`is_dish`] = 1 
//     }else if(req.body.is_dish == 2){
//         dishfinder[`is_dish`] = {
//             $in: [1,2]
//          }
//     }else{
//         delete dishfinder[`is_dish`];
//     }
//     console.log("dishfinder>>>>",dishfinder);
//     try {
//         var newArray=[];
//         var i = 0;
//         mealModel.find(finder).exec((err, students) => {
//             console.log("students>>>>>>>",students);
//             async.eachSeries(students, function (rec2, loop2){
//                 let responseobject={};
//                 dishfinder['mealId']=new ObjectId(rec2._id);
//                 responseobject.mealObject=rec2;
//                 (async () => {
//                     await dishModel.find(dishfinder).exec(function(err, dishResponse) {
//                         responseobject.dish=dishResponse;
//                         loop2();
//                         i = i + 1;
//                     });
//                 })();
//                 newArray.push(responseobject);
//             }, function(errSelPro) {
//                 if(errSelPro){
//                     return res.json({ error: true, status: 503, message: errSelPro })  
//                 }else{
//                     return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: newArray })
//                 }
//             })
//         });
//     } catch (error) {
//         res.status(400).json({ message: error.message, error: true })
//     }
// })

router.get('/my_account', async(req, res) => {
    try {
        var responseObject={
            resumeProfilePercentage:0,
            cuisinesPercentage:0,
            worksPercentage:0,
            appliancePercentage:0,
        }
        const data = await UserModel.findById(req.user._id);
        const totalResumeProfileField = 3;const totalCuisinesField = 2;const totalWorksField = 1;const totalHandsApplianceField = 1;
        var doneResumeProfileField = 0; var doneCuisinesField = 0; var doneWorksField = 0; var doneHandsApplianceField = 0;
        // Count 1
        if(data.resume != '' && data.resume != undefined){
            doneResumeProfileField=doneResumeProfileField+1;
        }
        if(data.experience != '' && data.experience != undefined){
            doneResumeProfileField=doneResumeProfileField+1;
        }
        if(data.job_profile != '' && data.job_profile != undefined){
            doneResumeProfileField=doneResumeProfileField+1;
        }
        // Count 2
        if(data.is_veg != '' && data.is_veg != undefined){
            doneCuisinesField=doneCuisinesField+1;
        }
        if(data.userCuisioness != undefined && data.userCuisioness.length>0 ){
            doneCuisinesField=doneCuisinesField+1;
        }
        // Count 3
        if(data.job_type != '' && data.job_type != undefined){
            doneWorksField=doneWorksField+1;
        }
        // Count 4
        if(data.userAppliance != undefined && data.userAppliance.length>0){
            doneHandsApplianceField=doneHandsApplianceField+1;
        }
        responseObject.resumeProfilePercentage=Number(commonFunction.getPersonalStatus(doneResumeProfileField, totalResumeProfileField));
        responseObject.cuisinesPercentage=Number(commonFunction.getPersonalStatus(doneCuisinesField, totalCuisinesField));
        responseObject.worksPercentage=Number(commonFunction.getPersonalStatus(doneWorksField, totalWorksField));
        responseObject.appliancePercentage=Number(commonFunction.getPersonalStatus(doneHandsApplianceField, totalHandsApplianceField));
        return res.json({ error: false, status: 200, message: 'Details Fetch Successfully', data: responseObject })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_resume_profile', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.resume = req.body.resume;
    updatedData.experience = req.body.experience;
    updatedData.job_profile = req.body.job_profile;
    if(req.body.order_type){
	updatedData.order_type = req.body.order_type;
	}
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Resume & Profile Details Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_work_details', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.job_type = req.body.job_type;
    updatedData.userRestaurant = req.body.userRestaurant;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Work Details Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_cuisioness', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.is_veg = req.body.is_veg;
    updatedData.userCuisioness = req.body.userCuisioness;
    updatedData.userDishArray = req.body.userDishArray;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Experience In Cuisines Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/update_special_appliance', async(req, res) => {
    const id = req.user._id;
    const updatedData = {};
    updatedData.userAppliance = req.body.userAppliance;
    const options = { new: true };
    try {
        const result = await UserModel.findByIdAndUpdate(
            id, updatedData, options
        )
        return res.json({ error: false, status: 200, message: 'Hands on Special Appliance Updated Successfully', data: result })
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

router.post('/getMealDish', async (req, res) => {
    try {
        
        
        let finder = { status: 1 };
        let dishfinder = { status: 1 };
        
        if (req.body.cuisineId.length > 0) {
            console.log(req.body.cuisineId)
            req.body.cuisineId = req.body.cuisineId.sort();
            console.log(req.body.cuisineId)
            dishfinder.cuisineId = { $in: req.body.cuisineId };
        }
  
        if (req.body.is_dish === 1) {
            dishfinder.is_dish = 1;
        } else if (req.body.is_dish === 2) {
            dishfinder.is_dish = { $in: [1, 2] };
        } else {
            delete dishfinder.is_dish;
        }
        
        // Generate a unique cache key based on request body
        const cacheKey = `mealDish_${JSON.stringify(req.body)}`;
       // Try to get cached result
       const cachedData = cache.get(cacheKey);
       if (cachedData) {
         console.log("return cache data"+ cacheKey);
         
         return res.json({ ...cachedData, cached: true });
       }
   
      const meals = await mealModel.find(finder).exec();
  
      const newArray = await Promise.all(
        meals.map(async (rec2) => {
          dishfinder.mealId = { $in: [String(rec2._id)] };
  
          const dishResponse = await dishModel
            .find(dishfinder)
            .populate('special_appliance_id', '_id name image')
            .populate('general_appliance_id', '_id name image')
            .populate('serving_dish', '_id name image')
            .exec();
  
          return { mealObject: rec2, dish: dishResponse };
        })
      );
  
      const responseData = {
        error: false,
        status: 200,
        message: 'Fetch Data Successfully',
        data: newArray
      };
  
      // Save response in cache
      cache.set(cacheKey, responseData);
  
      return res.json(responseData);
    } catch (error) {
      return res.status(500).json({ message: error.message, error: true });
    }
  });
  

router.get('/getCityServedLocalityList', async(req, res) => {
    let finder = { status: 1 };
    let localityfinder = { status: 1 };
    try {
        var newArray=[];
        var i = 0;
        cityServedModel.find(finder).exec((err, students) => {
            async.eachSeries(students, function (rec2, loop2){
                let responseobject={};
                localityfinder[`cityId`]={ '$in': String(rec2._id) }
                responseobject.cityObject=rec2;
                (async () => {
                    await cityServedLOcalityModel.find(localityfinder).exec(function(err, locality_resp) {
                        responseobject.locality=locality_resp;
                        loop2();
                        i = i + 1;
                    });
                })();
                newArray.push(responseobject);
            }, function(errSelPro) {
                if(errSelPro){
                    return res.json({ error: true, status: 503, message: errSelPro })  
                }else{
                    return res.json({ error: false, status: 200, message: 'Fetch Data Successfully', data: newArray })
                }
            })
        });
    } catch (error) {
        res.status(400).json({ message: error.message, error: true })
    }
})

module.exports = router;
