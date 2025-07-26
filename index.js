require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
let path = require("path");
let cookieParser = require("cookie-parser");
let bodyParser = require("body-parser");
let fs = require("fs");
const orderModel = require('./models/order');
const commonFunction = require('./store/commonFunction');
const sharp = require('sharp');
const cron = require('node-cron');
// Database Connection Start
mongoose.set("strictQuery", true);
mongoose.connect(
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_CLUSTER}/${process.env.MONGO_DATABASE}?retryWrites=true&w=majority`,
  { useNewUrlParser: true, useUnifiedTopology: true }
);
const database = mongoose.connection;
// Database Connection End



const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 1000000,
  })
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(async (req, res, next) => {
  var userdata = req.body;
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT,OPTIONS, DELETE, PATCH"
    );
    return res.status(200).json({});
  }
  if (req.method === "DELETE") {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT,OPTIONS, DELETE, PATCH"
    );
    return res.status(200).json({});
  }
  console.log('####################################### ' + req.url + ' API IS CALLED WITH DATA: ', userdata);
  var apiRequest={ date:new Date(), hostname:req.hostname, url: req.url, bodyData:userdata }
  fs.appendFile("postdata.txt", JSON.stringify(apiRequest), function(err22) {
  });
  next();
});

setInterval(async()=>{
  console.log("Checking orders");
  let finder = { };
  finder[`order_status`] = { $in: [0,1] };
  const isBookingOrder = await orderModel.find(finder);
  const isInProgressOrder = await orderModel.find({ order_status: 2});
  if(isBookingOrder.length>0){
    isBookingOrder.forEach(async(element1) => {
      const update = { order_status: 6 };
      if(commonFunction.getOrderExpire(element1)){
        const result = await orderModel.findByIdAndUpdate(element1._id, { $set: update })
      }else{
        
      }
    });
  }
  if(isInProgressOrder.length>0){
    isInProgressOrder.forEach(async(element2) => {
      const update = { order_status: 3 };
      if(commonFunction.getOrderComplete(element2)){
        const result = await orderModel.findByIdAndUpdate(element2._id, { $set: update })
      }else{
        
      }
    });
  }
  // console.log("Checking orders start");
},60000);
// ?? Run every Sunday at midnight
cron.schedule('0 0 * * 0', () => {
  console.log('?? Running weekly decoration popularity update...');
  commonFunction.updateDecorationPopularity()
});

setTimeout(async()=>{
  console.log("Updating scores")
  await commonFunction.updateDecorationPopularity()
},10000)

database.on("error", (error) => {
  console.log(error);
});

database.once("connected", () => {
  console.log("Database Connected index.js");
});

const AdminRoutes = require("./routes/admin");
const UserRoutes = require("./routes/user");
const EventInviteRoutes = require("./routes/createEventInvites");
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
let passportAuth = require("./store/passportAuth").passportAuth;

app.use("/api/admin", AdminRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/customer/event", passportAuth, EventInviteRoutes);
app.use("/api/users", passportAuth, UserRoutes);
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
const multerS3 = require('multer-s3');

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    cb(null, "attachment" + "-" + Date.now() + path.extname(file.originalname));
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

app.post("/api/multiple_image_upload", upload.array("files", 10), (req, res) => {
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
});

// === NEW: Memory storage for compressed image upload ===
const compressedUpload = multer({ storage: multer.memoryStorage() });

// Compress image to WebP under 40KB
const compressImageToWebP = async (buffer, outputPath, targetMaxKB = 40) => {
  let quality = 85;
  const step = 5;

  while (quality > 5) {
    const compressedBuffer = await sharp(buffer)
      .webp({ quality })
      .toBuffer();

    const sizeKB = compressedBuffer.length / 1024;

    if (sizeKB <= targetMaxKB) {
      fs.writeFileSync(outputPath, compressedBuffer);
      return true;
    }

    quality -= step;
  }

  // Final attempt with lowest quality
  const fallbackBuffer = await sharp(buffer)
    .webp({ quality: 5 })
    .toBuffer();
  fs.writeFileSync(outputPath, fallbackBuffer);
  return false;
};

// API: Upload and compress to WebP
app.post('/api/decoration_image_upload', compressedUpload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }

    const outputFolder = './uploads/compressed_webp';
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const originalName = path.parse(file.originalname).name;
    const fileName = `${originalName}-${Date.now()}.webp`;
    const outputPath = path.join(outputFolder, fileName);

    const success = await compressImageToWebP(file.buffer, outputPath);

    return res.json({
      error: false,
      status: 200,
      message: success ? 'Compressed under 40KB' : 'Saved with best effort',
      data: fileName,
    });
  } catch (err) {
    console.error('Compression error:', err);
    res.status(500).json({ error: true, message: 'Image compression failed' });
  }
});


app.post("/firebase/notification", async (req, res) => {
  try {
    const user = await UserModel.find({ _id: req.body.userId });
    console.log("user>>>>",user);
    console.log("user>>>>",user[0].device_token);
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
            '',
            req.body.type
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



const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
});

app.get('/test-s3', async (req, res) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,  // Your S3 bucket name
    };

    // List objects in the S3 bucket to test the connection
    const data = await s3.listObjectsV2(params).promise();

    if (data) {
      res.status(200).json({
        message: 'Successfully connected to S3!',
        s3Data: data,
      });
    }
  } catch (error) {
    console.error('Error connecting to S3:', error);
    res.status(500).json({
      message: 'Error connecting to S3',
      error: error.message,
    });
  }
});


// Not Found Error
app.use(function (req, res) {
  res.status(404).json({ message: "Api Not Exits In Server.", error: true });
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  // render the error page
  res.status(err.status || 500);
  res.json(err);
});

module.exports = app;
