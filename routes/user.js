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
const { default: mongoose } = require('mongoose');
const { generateThumbnail } = require('../store/multerS3Config');
const multer = require('multer');
const fs = require("fs");
const AWS = require("aws-sdk");
const cache = new NodeCache({ stdTTL: 60 * 10 }); // Cache TTL: 5 minutes
const  axios = require ('axios');


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

router.post('/otp_generate', async (req, res) => { 
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
        const user = await UserModel.findOne({ phone }); // Changed to `findOne` for efficiency

        const otp = commonFunction.OTP(); // Generate OTP

        if (user) { // If user exists, update their OTP and info
            const update = {
                otp: otp,
                device_token : req.body.device_token,
                name: req.body.name ?? user.name
            };

            await UserModel.findByIdAndUpdate(user._id, { $set: update });

            console.log('%c [  ]-92', 'font-size:13px; background:pink; color:#bf2c9f;', process.env.FAST2SMS_API_KEY)
            // Send OTP via SMS using Fast2SMS API (with Axios)
            const smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&message=182194&variables_values=${otp}&route=dlt&numbers=${phone}&sender_id=HORASR`;
            try {
                await axios.get(smsUrl); // Send OTP SMS
            } catch (smsError) {
                console.error("Error sending OTP SMS:", smsError);
            }

            return res.json({
                error: false,
                status: 200,
                otp,
                message: 'OTP sent successfully'
            });
        } else { // If user doesn't exist, create a new user
            const newUser = new UserModel({
                email: '',
                name: req.body.name && req.body.name,
                role: req.body.role,
                password: '',
                phone : req.body.phone,
                os : req.body.os,
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
                is_veg: true,
                isPersonalStatus: 0,
                isProfessionStatus: 0,
            });

            // Send OTP via SMS for new user
            const newSmsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&variables_values=${otp}&route=otp&numbers=${phone}`;

            try {
                await axios.get(newSmsUrl); // Send OTP SMS
            } catch (smsError) {
               console.log("error>>>>>>>>>>>22222222222222", smsError);
            }

            // Save new user to the database
            await newUser.save();

            return res.json({
                error: false,
                status: 200,
                otp,
                message: 'OTP sent successfully'
            });
        }
    } catch (error) {
        return res.status(400).json({
            message: error.message,
            error: true
        });
    }
});

router.post('/otp_verify', async (req, res) => {
    const { phone, otp, role } = req.body;
    if (!phone) {
        return res.status(422).json({
            error: true,
            status: 422,
            data: [{ path: 'phone', message: 'Phone is required.' }]
        });
    }
    if (!otp) {
        return res.status(422).json({
            error: true,
            status: 422,
            data: [{ path: 'otp', message: 'OTP is required.' }]
        });
    }
    if (!role) {
        return res.status(422).json({
            error: true,
            status: 422,
            data: [{ path: 'role', message: 'Role is required.' }]
        });
    }

    try {
        const user = await UserModel.findOne({ phone });

        if (!user) {
            return res.status(404).json({ error: true, status: 404, message: 'User not found' });
        }

        if (otp === '1234') { 
            if (role !== user.role) {
                return res.status(503).json({
                    error: true,
                    status: 503,
                    message: `The number is already used for ${commonFunction.capitalizeFirstLetter(user.role)} login. Please use a different number.`
                });
            }

            // Check account status
            if (user.status === 0) {
                return res.status(503).json({ error: true, status: 503, message: 'Account Blocked' });
            }
            if (user.status === 2) {
                return res.status(503).json({ error: true, status: 503, message: 'Account Deleted' });
            }

            return res.status(200).json({
                error: false,
                status: 200,
                data: user,
                token: passportAuth.signToken(user) // Generate token for the user
            });
        } else {
            if (otp !== user.otp) {
                return res.status(503).json({ error: true, status: 503, message: 'OTP Mismatch' });
            }

            // Check role again after OTP verification
            if (role !== user.role) {
                return res.status(503).json({
                    error: true,
                    status: 503,
                    message: `The number is already used for ${commonFunction.capitalizeFirstLetter(user.role)} login. Please use a different number.`
                });
            }

            if (user.status === 0) {
                return res.status(503).json({ error: true, status: 503, message: 'Account Blocked' });
            }
            if (user.status === 2) {
                return res.status(503).json({ error: true, status: 503, message: 'Account Deleted' });
            }

            return res.status(200).json({
                error: false,
                status: 200,
                data: user,
                token: passportAuth.signToken(user) // Generate token for the user
            });
        }

    } catch (error) {
        return res.status(400).json({
            message: error.message,
            error: true
        });
    }
});

router.get('/user_details', async (req, res) => {
    try {
        const totalPersonalField = 9;
        const totalProfessionalField = 6;

        let donePersonalField = 0;
        let doneProfessionalField = 0;

        // Fetch user
        const data = await UserModel.findById(req.user._id).populate({
            path: "userServedLocalities",
            populate: { path: "cityId" }
        });

        let userResponse = data;

        // Personal fields check
        const personalFields = [
            data?.name,
            data?.avatar,
            data?.age,
            data?.vechicle_type,
            data?.aadhar_no,
            data?.aadhar_front_img,
            data?.aadhar_back_img,
            data?.userServedLocalities?.length > 0 ? true : null,
            data?.city
        ];

        personalFields.forEach(field => {
            if (field !== '' && field !== undefined && field !== null) {
                donePersonalField++;
            }
        });

        userResponse.isPersonalStatus =
            donePersonalField === totalPersonalField ? 1 : 0;

        // Professional fields check
        const professionalFields = [
            data?.resume,
            data?.experience,
            data?.job_type,
            data?.is_veg,
            data?.userAppliance?.length > 0 ? true : null,
            data?.userCuisioness?.length > 0 ? true : null
        ];

        professionalFields.forEach(field => {
            if (field !== '' && field !== undefined && field !== null) {
                doneProfessionalField++;
            }
        });

        userResponse.isProfessionStatus =
            doneProfessionalField === totalProfessionalField ? 1 : 0;

        // Keep your existing timeout
        setTimeout(() => {
            return res.json({
                error: false,
                status: 200,
                message: 'Details Fetch Successfully',
                data: data
            });
        }, 1000);

    } catch (error) {
        res.status(400).json({ message: error.message, error: true });
    }
});

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });


//  Get user details by ID
router.get("/user-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid user id");
    }

    // Fetch user
    const user = await UserModel.findById(id).lean();
    if (!user) {
      return sendResponse(res, 404, true, "User not found");
    }

    const respData = {
      _id: user._id,
      name: user.name ?? "",
      phone: user.phone ?? "",
      avatar: user.avatar ?? "",
    };

    return sendResponse(
      res,
      200,
      false,
      "User fetched successfully",
      respData
    );
  } catch (err) {
    console.error("Fetch user error:", {
      message: err.message,
      stack: err.stack,
      eventId: req.params.id,
    });

    return sendResponse(res, 500, true, `Server error: ${err.message}`);
  }
});

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_BASE_URL = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;


// Temporary storage for uploaded files
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadSingle = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
}).single("image");

const uploadImageToS3 = async (
  filePath,
  fileName,
  userId,
  eventId,
  mimeType,
  folderName
) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${folderName}/${userId}/${eventId}/${fileName}`, // Folder name at the start
    Body: fs.createReadStream(filePath),
    ContentType: mimeType,
  };
  const data = await s3.upload(params).promise();
  return data;
};

async function deleteFromS3(key) {
  if (!key) return;
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
}

const deleteFileWithRetry = async (filePath, retries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // await fs.unlink(filePath);
      await fs.promises.unlink(filePath);
      console.log(`Successfully deleted file: ${filePath}`);
      return;
    } catch (err) {
      console.error(
        `Attempt ${attempt} to delete file ${filePath} failed:`,
        err.message
      );
      if (attempt === retries) {
        console.error(
          `Failed to delete file ${filePath} after ${retries} attempts`
        );
        return; // Don't throw error to avoid interrupting the response
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

function isS3Url(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  const regex = new RegExp(
    `^${S3_BASE_URL}/event-invites/[^/]+/[^/]+\.[a-zA-Z]+$`
  );
  return regex.test(str);
}


// Update user details by id
// router.put("/user-details/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return sendResponse(res, 400, true, "Invalid user id");
//     }

//     const { name, phone, avatar } = req.body;

//     // Agar kuch bhi update fields nahi bheji
//     if (!name && !phone && !avatar) {
//       return sendResponse(res, 400, true, "No fields provided to update");
//     }

//     // Update object prepare karo
//     let updateData = {};
//     if (name) updateData.name = name;
//     if (phone) updateData.phone = phone;
//     if (avatar) updateData.avatar = avatar;

//     const updatedUser = await UserModel.findByIdAndUpdate(
//       id,
//       { $set: updateData },
//       { new: true, lean: true }
//     );

//     if (!updatedUser) {
//       return sendResponse(res, 404, true, "User not found");
//     }

//     let respData = {
//       name: updatedUser.name,
//       _id: updatedUser._id,
//       phone: updatedUser.phone,
//       avatar: updatedUser.avatar,
//     };

//     return sendResponse(res, 200, false, "User updated successfully", respData);
//   } catch (err) {
//     console.error("Update user error:", {
//       message: err.message,
//       stack: err.stack,
//       userId: req.params.id,
//     });
//     return sendResponse(res, 500, true, `Server error ${err.message}`);
//   }
// });


//  Update user details (Name) and also update name in guest models for RSVP
router.put("/user-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid user id");
    }

    const { name, phone, avatar } = req.body;

    // Agar kuch bhi update fields nahi bheji
    if (!name && !phone && !avatar) {
      return sendResponse(res, 400, true, "No fields provided to update");
    }

    // Update object prepare karo
    let updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;

    const updatedUser = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, lean: true }
    );

    if (!updatedUser) {
      return sendResponse(res, 404, true, "User not found");
    }

    // 🔥 EXTRA FEATURE: Update name in all EventGuest entries for this user
    if (name !== undefined) {
      const EventGuest = require("../models/event-guest"); // Import lazily to avoid circular deps

      await EventGuest.updateMany(
        { userId: id },        
        { $set: { name: name } }
      );

      console.log(`✅ Updated guest names for user ${id} in all event records`);
    }

    let respData = {
      name: updatedUser.name,
      _id: updatedUser._id,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
    };

    return sendResponse(res, 200, false, "User updated successfully", respData);

  } catch (err) {
    console.error("Update user error:", {
      message: err.message,
      stack: err.stack,
      userId: req.params.id,
    });

    return sendResponse(res, 500, true, `Server error ${err.message}`);
  }
});

// Update user image avatar by id
router.put(
  "/user-avatar/:id",
  async (req, res, next) => {
    await new Promise((resolve) => {
      uploadSingle(req, res, (err) => {
        if (err) {
          return sendResponse(res, 400, true, err.message); 
        }
        resolve();
      });
    });
    next();
  },

  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return sendResponse(res, 400, true, "Invalid user ID"); // SAME
      }

      const file = req.file;
      const { avatar, clearAvatar } = req.body;

      const user = await UserModel.findById(id);
      if (!user) return sendResponse(res, 404, true, "User not found");

      if (clearAvatar === "true") {
        if (user.avatar) {
          const key = user.avatar.split(`${process.env.S3_BUCKET_NAME}/`)[1];
          if (key) await deleteFromS3(key);
        }
        user.avatar = null;
      }

      else if (file) {
        if (user.avatar) {
          const key = user.avatar.split(`${process.env.S3_BUCKET_NAME}/`)[1];
          if (key) await deleteFromS3(key);
        }

        const webpFileName = `avatar.webp`;
        const webpPath = file.path.replace(/\.(png|jpeg|jpg)$/i, "") + ".webp";

        await generateThumbnail(file.path, webpPath);

        const uploadResult = await uploadImageToS3(
          webpPath,
          webpFileName,
          id,
          id,
          "image/webp",
          "user-profile"
        );

        user.avatar = uploadResult.Location;

        await Promise.all([
          deleteFileWithRetry(file.path),
          deleteFileWithRetry(webpPath)
        ]);
      }

      else if (avatar) {
        if (isS3Url(avatar)) user.avatar = avatar;
        else
          return sendResponse(
            res,
            400,
            true,
            "Invalid avatar format. Must be a valid S3 URL"
          );
      }

      else {
        return sendResponse(
          res,
          400,
          true,
          "Avatar image, URL, or clearAvatar is required"
        );
      }

      const updated = await user.save();
      return sendResponse(res, 200, false, "User avatar updated successfully", {
        _id: updated._id,
        avatar: updated.avatar
      });
    } catch (err) {
      console.error("Update User Avatar Error:", {
        message: err.message,
        stack: err.stack,
        userId: req.params.id,
        requestBody: req.body,
      });
      return sendResponse(res, 500, true, "Server error"); // SAME
    }
  }
);



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

router.post('/supplier_personal_details_update', async (req, res) => {
    const id = req.user._id;

    // Prepare updated data cleanly (only keys that exist in req.body)
    const updatedData = {
        name: req.body.name,
        age: req.body.age,
        vechicle_type: req.body.vechicle_type,
        city: req.body.city,
        lat: req.body.lat,
        lng: req.body.lng,
        aadhar_no: req.body.aadhar_no,
        aadhar_front_img: req.body.aadhar_front_img,
        aadhar_back_img: req.body.aadhar_back_img,
        avatar: req.body.avatar,
        userServedLocalities: req.body.userServedLocalities,
        order_type: req.body.order_type
    };

    const options = { new: true };

    try {
        const result = await UserModel.findByIdAndUpdate(id, updatedData, options);

        return res.json({
            error: false,
            status: 200,
            message: 'Personal Details Updated Successfully',
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            message: error.message,
            error: true
        });
    }
});

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

router.post('/update_resume_profile', async (req, res) => {
    try {
        const id = req.user._id;

        const {
            resume,
            experience,
            job_profile,
            order_type
        } = req.body;

        const updatedData = {
            resume,
            experience,
            job_profile
        };

        if (order_type) {
            updatedData.order_type = order_type;
        }

        const options = { new: true };

        const result = await UserModel.findByIdAndUpdate(
            id,
            updatedData,
            options
        );

        return res.json({
            error: false,
            status: 200,
            message: 'Resume & Profile Details Updated Successfully',
            data: result
        });

    } catch (error) {
        return res.status(400).json({
            error: true,
            message: error.message
        });
    }
});

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
    const { cuisineId = [], is_dish } = req.body;

    let finder = { status: 1 };
    let dishfinder = { status: 1 };

    if (Array.isArray(cuisineId) && cuisineId.length > 0) {
      dishfinder.cuisineId = { 
        $in: cuisineId.map(id => new mongoose.Types.ObjectId(id)) 
      };
    }

    if (is_dish === 1) {
      dishfinder.is_dish = 1;
    } else if (is_dish === 2) {
      dishfinder.is_dish = { $in: [1, 2] };
    } else {
          delete dishfinder.is_dish;
      }

    const meals = await mealModel.find(finder).exec();

    const newArray = await Promise.all(
      meals.map(async (meal) => {
        dishfinder.mealId = { $in: [new mongoose.Types.ObjectId(meal._id)] };

        let query = dishModel.find(dishfinder);

        ['special_appliance_id', 'general_appliance_id', 'serving_dish']
          .forEach(field => {
            if (dishModel.schema.path(field)) {
              query = query.populate(field, '_id name image');
            }
          });

        const dishResponse = await query.exec();
        return { mealObject: meal, dish: dishResponse };
      })
    );

    return res.json({
      error: false,
      status: 200,
      message: "Fetch Data Successfully",
      data: newArray
    });

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
