require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
let path = require("path");
let cookieParser = require("cookie-parser");
let bodyParser = require("body-parser");
let fs = require("fs");
const orderModel = require("./models/order");
const commonFunction = require("./store/commonFunction");
const sharp = require("sharp");
const cron = require("node-cron");
const { runPackageSync } = require("./store/import-venue-packages");
const axios = require("axios")
// Database Connection Start
mongoose.set("strictQuery", true);
mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`,
);
const database = mongoose.connection;

const deploymentId = process.env.GOOGLE_SCRIPT_DEPLOYMENT_ID;
// Database Connection End

const app = express();
app.use(cors());
// app.use(express.json());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 1000000,
  }),
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(async (req, res, next) => {
  var userdata = req.body;
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  if (req.method === "OPTIONS") {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT,OPTIONS, DELETE, PATCH",
    );
    return res.status(200).json({});
  }
  if (req.method === "DELETE") {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT,OPTIONS, DELETE, PATCH",
    );
    return res.status(200).json({});
  }
  console.log(
    "####################################### " +
      req.url +
      " API IS CALLED WITH DATA: ",
    userdata,
  );
  var apiRequest = {
    date: new Date(),
    hostname: req.hostname,
    url: req.url,
    bodyData: userdata,
  };
  fs.appendFile(
    "postdata.txt",
    JSON.stringify(apiRequest),
    function (err22) {},
  );
  next();
});

setInterval(async () => {
  console.log("Checking orders");
  let finder = {};
  finder[`order_status`] = { $in: [0, 1] };
  const isBookingOrder = await orderModel.find(finder);
  const isInProgressOrder = await orderModel.find({ order_status: 2 });
  if (isBookingOrder.length > 0) {
    isBookingOrder.forEach(async (element1) => {
      const update = { order_status: 6 };
      if (commonFunction.getOrderExpire(element1)) {
        const result = await orderModel.findByIdAndUpdate(element1._id, {
          $set: update,
        });
      } else {
      }
    });
  }
  if (isInProgressOrder.length > 0) {
    isInProgressOrder.forEach(async (element2) => {
      const update = { order_status: 3 };
      if (commonFunction.getOrderComplete(element2)) {
        const result = await orderModel.findByIdAndUpdate(element2._id, {
          $set: update,
        });
      } else {
      }
    });
  }
  // console.log("Checking orders start");
}, 60000);

// ?? Run every Sunday at midnight 12:30
cron.schedule(
  "30 0 * * 0",
  () => {
    console.log(
      "?? Running weekly decoration popularity update at 12:30 AM IST...",
    );
    commonFunction.updateDecorationPopularity();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  },
);

// Every day 00:00 UTC
cron.schedule(
  "10 0 * * *",
  async () => {
    console.log("Running Package Sync Cron");
    await runPackageSync();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  },
);

// setTimeout(async()=>{
//   console.log("Running Package Sync Cron")
//   await runPackageSync()
// }, 1.5 * 60 * 1000);

async function runSupplierPerformance() {
  try {
    console.log("Running Supplier Performance Job:", new Date());

    const suppliers = await UserModel.find({ role: "supplier" });

    for (const supplier of suppliers) {
      //calculatttion
      const orders = await orderModel
        .find({
          toId: supplier._id,
          order_status: { $in: [3, 6] },
          $or: [
            { userReviewRatingArray: { $exists: true, $ne: [] } },
            { reviewStatus: { $exists: true, $ne: null } }
          ]
        })
        .sort({ createdAt: -1 }) // newest order
        .limit(5);

      if (!orders.length) continue;

      let excellent = 0;
      let good = 0;
      let poor = 0;
      let positiveReviews = 0;
      let negativeReviews = 0;

      let totalFeedbackCount = 0;

      for (const order of orders) {
        const rating = order.userReviewRatingArray;
        const rate = Array.isArray(rating) ? rating[0] : rating;

        if (order.reviewStatus === "positive" || order.reviewStatus === "negative"){
          totalFeedbackCount++;
        if (order.reviewStatus === "positive") {
          positiveReviews++;
        } else if (order.reviewStatus === "negative") {
          negativeReviews++;
        }
          continue;
      }

      if(rate){
        totalFeedbackCount++;
        if (rate === "9-10") excellent++;
        else if (rate === "7-8") good++;
        else if (rate === "1-6") poor++;
        else if (rate === "6-8") good++;
        else if (rate === "0-6") poor++;
      }

      }

      if (totalFeedbackCount === 0) {
        await UserModel.updateOne(
          { _id: supplier._id },
          {
            performanceScore: 0,
            performanceBadge: "Low",
            lastRatingUpdate: new Date(),
          },
        );

        continue;
      }

      const vendorScore =
        ((excellent * 10) + (positiveReviews * 10) + (good * 5) + (negativeReviews * -20) + (poor * -10)) / totalFeedbackCount;

      let badge = "Low";

      if (vendorScore >= 7) badge = "Elite";
      else if (vendorScore >= 5) badge = "Good";
      else if (vendorScore >= 3) badge = "Average";
      else if (vendorScore < 3) badge = "Low";

      await UserModel.updateOne(
        { _id: supplier._id },
        {
          performanceScore: vendorScore,
          performanceBadge: badge,
          lastRatingUpdate: new Date(),
        },
      );
    }
    console.log("Supplier performance updated successfully");
  } catch (error) {
    console.error("Performance job error:", error);
  }
}

// Runs every day at 3:00 AM
cron.schedule("0 3 * * *", async () => {
  console.log("Running Supplier Performance Job:", new Date());
  await runSupplierPerformance();
});


// async function sendNotificationsInPriority() {
//   try {
//     const orders = await orderModel.find({
//       order_status: 0,
//       notificationStep: { $lt: 4 }
//     });
//     for (const order of orders) {
//       const freshOrder = await orderModel.findById(order._id).select(
//         'order_status notificationStep lastNotifiedAt order_locality type order_id fromId'
//       );

//       if (!freshOrder || freshOrder.order_status !== 0) {
//         continue;
//       }

//       const now = new Date();

//       const diff = (now - new Date(freshOrder.lastNotifiedAt)) / (1000 * 60);

//       if (diff < 20) continue;

//       let badgeToSend = "";
//       if (freshOrder.notificationStep === 1) badgeToSend = "Good";
//       else if (freshOrder.notificationStep === 2) badgeToSend = "Average";
//       else if (freshOrder.notificationStep === 3) badgeToSend = "Low";

//       if (!badgeToSend) {
//         continue;
//       }


//       const suppliers = await UserModel.find({
//         role: "supplier", 
//         device_token: { $nin: [null, ""] },
//         city: freshOrder.order_locality,
//         order_type: freshOrder.type,
//         performanceBadge: badgeToSend
//       });


//       if (suppliers.length === 0) {
//         freshOrder.notificationStep += 1;
//         freshOrder.lastNotifiedAt = now;
//         await freshOrder.save();
//         continue;
//       }


//       const notificationPromises = suppliers.map(supplier =>
//         notificationFunction.sendNotifications(
//           supplier.device_token,
//           freshOrder.fromId,
//           'New Order',
//           `New Order!!! Order ID: #${freshOrder.order_id + 10800} 🥳🤩`,
//           '',
//           0
//         ).catch(err => console.error("Notification failed for token:", supplier.device_token, err))
//       );

//       await Promise.all(notificationPromises);


//       const finalCheck = await orderModel.findById(order._id).select('order_status order_id notificationStep lastNotifiedAt');
//       if (finalCheck && finalCheck.order_status === 0) {
//         finalCheck.notificationStep += 1;
//         finalCheck.lastNotifiedAt = new Date();
//         await finalCheck.save();
//       }
//     }

//   } catch (error) {
//     console.error("Notification Scheduler Error:", error);
//   }
// }


// cron.schedule("*/1 * * * *", async () => {
//   await sendNotificationsInPriority();
// });

cron.schedule('0 20 * * *', async () => {
  console.log('--- Cron Job Started: Processing Today\'s Active Orders for Inclusions ---');

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const orders = await orderModel.find({
      order_date: {
        $gte: startOfToday,
        $lte: endOfToday
      },
      status: 1,
      type: 8
    }).select('order_id order_date call_checklist');

    if (orders.length === 0) {
      console.log('No matching orders found for today.');
      return;
    }

    for (const order of orders) {
      const inclusions = order?.call_checklist?.inclusions || {};

      const trueInclusions = Object.keys(inclusions).filter(key => inclusions[key] === true);

      if (trueInclusions.length === 0) {
        continue; 
      }

      const googlePayload = {
        targetSheet: "photography_inclusions",
        orderId: String(Number(order.order_id) + 10800), 
        orderDate: order.order_date
          ? new Date(order.order_date).toLocaleDateString("en-GB")
          : "N/A",
        inclusions: trueInclusions 
      };

      await axios
        .post(
          `https://script.google.com/macros/s/${deploymentId}/exec`,
          googlePayload,
          { headers: { "Content-Type": "application/json" } }
        )
        .then(() => {
          console.log(`Successfully synced Inclusions for Order ID: ${googlePayload.orderId}`);
        })
        .catch((err) => {
          console.error(
            `Google Sheet integration failed for Order [${order.order_id}]:`,
            err.message
          );
        });
    }

  } catch (error) {
    console.error('Error running cron job:', error);
  }
});
database.on("error", (error) => {
  console.log(error);
});

database.once("connected", () => {
  console.log("Database Connected index.js");
});

const AdminRoutes = require("./routes/admin");
const UserRoutes = require("./routes/user");
const EventInviteRoutes = require("./routes/createEventInvites");
const EventChatRoutes = require("./routes/eventChat");
const EventBadgeRoutes = require("./routes/event-badge");
const ConfigurationRoutes = require("./routes/configuration");
const IngredientRoutes = require("./routes/ingredient");
const ingredientTypeRoutes = require("./routes/ingredientType");
const SubCategoryRoutes = require("./routes/sub-category");
const MealsRoutes = require("./routes/meal");
const SettingRoutes = require("./routes/setting");
const DishRoutes = require("./routes/dish");
const CityServedRoutes = require("./routes/city-served");
const CityServedLocalityRoutes = require("./routes/city-served-locality");
const ShopsRoutes = require("./routes/shops");
const AddressRoutes = require("./routes/address");
const OrderRoutes = require("./routes/order");
const PaymentGatewayRoutes = require("./routes/payment-gateway");
const DecorationRoutes = require("./routes/decoration");
const PhotographyRoutes = require("./routes/photography");
const PhotoRoutes = require("./routes/photo");
const DriveImportRoute = require("./routes/drive-import");
const weblinkRoutes = require("./routes/weblink");
const analyticsRoutes = require("./routes/analytics");
const FoodPackageRoutes = require("./routes/food-package");
const MaterialListRoutes = require("./routes/material-list");
const CelebrationBoosterRoutes = require("./routes/celebration-booster");
const PartyHallVenueRoutes = require("./routes/createPartyVenue");
const venuePackageRoutes = require("./routes/venue-package");
const venuePackageCategoryRoutes = require("./routes/venue-package-categories");
const venuePackageItemRoutes = require("./routes/venue-package-items");
const EventShareRoutes = require("./routes/event-share");
const ShareCapsule = require("./routes/share-capsule")
const SearchTrackingRoutes = require("./routes/search-tracking")
const EventDateRoutes = require("./routes/event-dates");
const AddonRoutes = require("./routes/addon")
const ErrorLogRoutes = require("./routes/error-log")
const pinCodes = require("./routes/serviceabilityPincodes")
let passportAuth = require("./store/passportAuth").passportAuth;

app.use("/api/admin", AdminRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/customer/event", EventInviteRoutes);
app.use("/api/customer/event/chat", EventChatRoutes);
app.use("/api/users", UserRoutes);
app.use("/api/configuration", ConfigurationRoutes);
app.use("/api/ingredient", IngredientRoutes);
app.use("/api/ingredient_type", ingredientTypeRoutes);
app.use("/api/meals", MealsRoutes);
app.use("/api/setting", SettingRoutes);
app.use("/api/dish", DishRoutes);
app.use("/api/city_served", CityServedRoutes);
app.use("/api/city_served_locality", CityServedLocalityRoutes);
app.use("/api/shops", ShopsRoutes);
app.use("/api/order", OrderRoutes);
app.use("/api/users/address", passportAuth, AddressRoutes);
app.use("/api/payment_gateway", PaymentGatewayRoutes);
app.use("/api/decoration", DecorationRoutes);
app.use("/api/photography", PhotographyRoutes);
app.use("/api/photo", PhotoRoutes);
app.use("/api/photo/drive", DriveImportRoute);
app.use("/api/wonderland/badge", EventBadgeRoutes);
app.use("/api/internal", weblinkRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/food-package", FoodPackageRoutes);
app.use("/api/material-list", MaterialListRoutes);
app.use("/api/celebration-booster", CelebrationBoosterRoutes);
app.use("/api/party-venue", PartyHallVenueRoutes);
app.use("/api/party-venue/package", venuePackageRoutes);
app.use("/api/party-venue/package-category", venuePackageCategoryRoutes);
app.use("/api/party-venue/package-item", venuePackageItemRoutes);
app.use("/api/search-tracking", SearchTrackingRoutes);
app.use("/api/event-dates", EventDateRoutes);
app.use("/smartinvite/share", EventShareRoutes);
app.use("/eventcapsule/share", ShareCapsule);
app.use("/api/addon", AddonRoutes);
app.use("/api/error-log", ErrorLogRoutes.router);
app.use("/api/pincode", pinCodes)

const notificationFunction = require("./store/notifications");
const UserModel = require("./models/user");

// testing api
app.get("/test", function (req, res) {
  return res.json({
    error: false,
    status: 200,
    message: "api test successfully",
  });
});
app.post("/test_post", function (req, res) {
  return res.json({
    error: false,
    status: 200,
    message: "api test successfully",
    
    data: req.body,
  });
});
/* upload file */
var multer = require("multer");
const multerS3 = require("multer-s3");

// STATIC SERVE TEMPLATE ASSETS
app.use(
  "/api/template-assets",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.floor(Math.random() * 1000000);

    cb(null, "attachment-" + uniqueSuffix + path.extname(file.originalname));
  },
});

var upload = multer({ storage: storage });
app.post("/api/image_upload", upload.single("file"), function (req, res) {
  const file = req.file;
  return res.json({
    error: false,
    status: 200,
    message: "upload image successfully",
    data: file.filename,
  });
});

app.post(
  "/api/multiple_image_upload",
  upload.array("files", 10),
  (req, res) => {
    // 'files' is the field name for uploaded images, max 10 files
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: true,
        status: 400,
        message: "No files were uploaded",
      });
    }

    const uploadedFiles = files.map((file) => file.filename); // Extract filenames of uploaded files

    return res.json({
      error: false,
      status: 200,
      message: "Images uploaded successfully",
      data: uploadedFiles,
    });
  },
);

// === NEW: Memory storage for compressed image upload ===
const compressedUpload = multer({ storage: multer.memoryStorage() });

// Compress image to WebP under 40KB
const compressImageToWebP = async (buffer, outputPath, targetMaxKB = 40) => {
  let quality = 85;
  const step = 5;

  while (quality > 5) {
    const compressedBuffer = await sharp(buffer).webp({ quality }).toBuffer();

    const sizeKB = compressedBuffer.length / 1024;

    if (sizeKB <= targetMaxKB) {
      fs.writeFileSync(outputPath, compressedBuffer);
      return true;
    }

    quality -= step;
  }

  // Final attempt with lowest quality
  const fallbackBuffer = await sharp(buffer).webp({ quality: 5 }).toBuffer();
  fs.writeFileSync(outputPath, fallbackBuffer);
  return false;
};

// API: Upload and compress to WebP
//fixed
app.post(
  "/api/decoration_image_upload",
  compressedUpload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ error: true, message: "No file uploaded" });
      }

      const outputFolder = "./uploads/compressed_webp";
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      const originalName = path.parse(file.originalname).name;
      const fileName = `${originalName}-${Date.now()}.webp`;
      const outputPath = path.join(outputFolder, fileName);

      // Compress image buffer to WebP and save
      let success = false;
      try {
        success = await compressImageToWebP(file.buffer, outputPath);
      } catch (compressErr) {
        console.error("Compression failed, saving best effort:", compressErr);
        // Optionally, you could fallback to saving original buffer as .webp
      }

      return res.json({
        error: false,
        status: 200,
        message: success ? "Compressed under 40KB" : "Saved with best effort",
        data: fileName,
      });
    } catch (err) {
      console.error("Compression error:", err);
      return res
        .status(500)
        .json({ error: true, message: "Image compression failed" });
    }
  },
);

app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/firebase/notification", async (req, res) => {
  try {
    const user = await UserModel.find({ _id: req.body.userId });
    console.log("user>>>>", user);
    console.log("user>>>>", user[0].device_token);
    if (user.length > 0) {
      if (user[0].device_token != "") {
        return res.json({
          error: false,
          status: 200,
          message: "Notification Sent Successfully",
          data: notificationFunction.sendNotifications(
            user[0].device_token,
            req.body.userId,
            req.body.title,
            req.body.message,
            "",
            req.body.type,
          ),
        });
      } else {
        return res.json({
          error: true,
          status: 503,
          message: "No token registered with this user",
        });
      }
    } else {
      return res.json({ error: true, status: 503, message: "No user found" });
    }
  } catch (error) {
    res.status(400).json({ message: error.message, error: true });
  }
});

const AWS = require("aws-sdk");
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
});

app.get("/test-s3", async (req, res) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME, // Your S3 bucket name
    };

    // List objects in the S3 bucket to test the connection
    const data = await s3.listObjectsV2(params).promise();

    if (data) {
      res.status(200).json({
        message: "Successfully connected to S3!",
        s3Data: data,
      });
    }
  } catch (error) {
    console.error("Error connecting to S3:", error);
    res.status(500).json({
      message: "Error connecting to S3",
      error: error.message,
    });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/socket.io")) {
    return next();
  }

  res.status(404).json({ message: "Api Not Exits In Server.", error: true });
});

// Global error handler
if (process.env.NODE_ENV != "development") {
  app.use(ErrorLogRoutes.globalErrorHandler);
}
module.exports = app;
