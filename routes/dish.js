const express = require("express");
const dishModel = require("../models/dish");
const decorationModel = require("../models/decoration");
const photographyModel = require("../models/photography");
const { CustomResponse } = require("../store/commonFunction");
const { bulkFoodCuisineId } = require("../utils/constants");
const router = express.Router();
const { default: mongoose } = require("mongoose");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const AddOn = require("../models/addon");

sharp.concurrency(1);
sharp.cache(false);

// Existing memoryStorage kept intact so other routes in dish.js don't break
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Directories for Disk-Based Media Upload (Images + Videos)
const TEMP_UPLOAD_DIR = path.resolve(__dirname, "../uploads/temp");
const IMAGE_OUTPUT_DIR = path.resolve(__dirname, "../uploads/compressed_webp");
const VIDEO_OUTPUT_DIR = path.resolve(__dirname, "../uploads/compressed_webp");

[TEMP_UPLOAD_DIR, IMAGE_OUTPUT_DIR, VIDEO_OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Dedicated DiskStorage for Decoration Media (Safe for large videos)
const mediaDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const mediaUpload = multer({
  storage: mediaDiskStorage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB max per file
});

const isVideoFile = (file) => {
  if (!file) return false;
  if (file.mimetype && file.mimetype.startsWith("video/")) return true;
  return /\.(mp4|webm|ogg|mov|mkv|avi)$/i.test(file.originalname || "");
};

const sanitizeBaseName = (originalName) => {
  return path
    .parse(originalName)
    .name.replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
};

const deleteFileIfExists = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("File delete error:", err);
  }
};

// Supports both Buffer and File Path
const compressImageToWebP = async (inputSource, outputPath, targetMaxKB = 40) => {
  let quality = 85;
  const step = 5;

  while (quality > 5) {
    const compressedBuffer = await sharp(inputSource)
      .webp({ quality })
      .toBuffer();

    const sizeKB = compressedBuffer.length / 1024;

    if (sizeKB <= targetMaxKB) {
      await fsPromises.writeFile(outputPath, compressedBuffer);
      return true;
    }

    quality -= step;
  }

  // Final attempt with lowest quality
  const fallbackBuffer = await sharp(inputSource)
    .webp({ quality: 5 })
    .toBuffer();
  await fsPromises.writeFile(outputPath, fallbackBuffer);
  return false;
};

const normalizeInclusion = (inclusion) => {
  if (!inclusion) return [];

  try {
    if (typeof inclusion === "string" && inclusion.startsWith("[")) {
      inclusion = JSON.parse(inclusion);
    }
    if (typeof inclusion === "string") {
      return [inclusion];
    }
    if (Array.isArray(inclusion)) {
      return [inclusion.filter(Boolean).join("")];
    }
    return [];
  } catch (err) {
    console.error("normalizeInclusion error", err);
    return [];
  }
};

// ============================================================================
// BACKGROUND VIDEO COMPRESSION QUEUE (Sequential 1-by-1)
// ============================================================================
const videoJobQueue = [];
let isProcessingVideo = false;

const compressVideoFile = (inputPath, tempCompressedPath) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`🎬 [BG VIDEO] Compression started: ${path.basename(inputPath)}`);

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .videoFilters("scale='min(1080,iw)':-2")
      .outputOptions([
        "-crf 26",
        "-preset veryfast",
        "-profile:v high",
        "-level 4.1",
        "-pix_fmt yuv420p",
        "-maxrate 2200k",
        "-bufsize 4400k",
        "-threads 1",
        "-c:a aac",
        "-b:a 96k",
        "-movflags +faststart",
      ])
      .on("end", () => {
        const sec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [BG VIDEO] Done in ${sec}s: ${path.basename(inputPath)}`);
        resolve(tempCompressedPath);
      })
      .on("error", (err) => {
        console.error(`❌ [BG VIDEO] Failed:`, err.message);
        reject(err);
      })
      .save(tempCompressedPath);
  });
};

const enqueueVideoCompression = (job) => {
  videoJobQueue.push(job);
  processNextVideoJob();
};

const processNextVideoJob = async () => {
  if (isProcessingVideo || videoJobQueue.length === 0) return;
  isProcessingVideo = true;

  const { decorationId, fileName } = videoJobQueue.shift();
  const targetFilePath = path.join(VIDEO_OUTPUT_DIR, fileName);
  const tempOutPath = path.join(TEMP_UPLOAD_DIR, `comp_${fileName}`);

  try {
    const currentDoc = await decorationModel.findById(decorationId).lean();
    const stillExists = currentDoc?.featured_images?.some(
      (m) => m.fileName === fileName
    );

    if (!currentDoc || !stillExists || !fs.existsSync(targetFilePath)) {
      deleteFileIfExists(tempOutPath);
      return;
    }

    await compressVideoFile(targetFilePath, tempOutPath);

    const latestDoc = await decorationModel.findById(decorationId).lean();
    const stillValid = latestDoc?.featured_images?.some(
      (m) => m.fileName === fileName
    );
    if (!latestDoc || !stillValid) {
      deleteFileIfExists(tempOutPath);
      return;
    }

    const rawSizeMB = (fs.statSync(targetFilePath).size / (1024 * 1024)).toFixed(2);
    const compSizeMB = (fs.statSync(tempOutPath).size / (1024 * 1024)).toFixed(2);

    // Atomic replace: deletes original raw video & puts compressed MP4 in its place
    await fsPromises.rename(tempOutPath, targetFilePath);

    await decorationModel.updateOne(
      { _id: decorationId, "featured_images.fileName": fileName },
      { $set: { "featured_images.$.videoStatus": "ready" } }
    );

    console.log(`📦 [BG VIDEO] Replaced ${fileName} (${rawSizeMB}MB -> ${compSizeMB}MB)`);
  } catch (err) {
    deleteFileIfExists(tempOutPath);
    await decorationModel
      .updateOne(
        { _id: decorationId, "featured_images.fileName": fileName },
        { $set: { "featured_images.$.videoStatus": "ready" } }
      )
      .catch(() => {});
  } finally {
    isProcessingVideo = false;
    processNextVideoJob();
  }
};

// ============================================================================
// ROUTE: /decoration/add (Unified `featured_images` for Images + Videos)
// ============================================================================
router.post(
  "/decoration/add",
  mediaUpload.array("featured_images", 10),
  async (req, res, next) => {
    const files = req.files || [];

    try {
      if (files.length === 0) {
        return res.status(400).json({
          error: true,
          message: "At least 1 image or video is required",
        });
      }

      // Check duplicate BEFORE heavy image/video processing
      const existing = await decorationModel.findOne({
        name: req.body.name,
      });

      if (existing) {
        files.forEach((f) => deleteFileIfExists(f.path));
        return res.json({
          error: true,
          status: 503,
          message: "Decoration already exists",
        });
      }

      // 🧠 PROCESS ALL IMAGES & VIDEOS INTO `featured_images`
      const mediaItems = [];
      const queuedVideos = [];

      for (const file of files) {
        const cleanName = sanitizeBaseName(file.originalname);
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

        if (isVideoFile(file)) {
          const fileName = `${uniquePrefix}-${cleanName}.mp4`;
          const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, fileName);

          // Move raw video from temp to compressed_webp (will be replaced after FFmpeg)
          await fsPromises.rename(file.path, finalVideoPath);

          mediaItems.push({
            fileName,
            url: `/uploads/compressed_webp/${fileName}`,
            mediaType: "video",
            videoStatus: "processing",
            createdAt: new Date(),
          });
          queuedVideos.push(fileName);
        } else {
          const fileName = `${uniquePrefix}-${cleanName}.webp`;
          const outputPath = path.join(IMAGE_OUTPUT_DIR, fileName);

          await compressImageToWebP(file.path, outputPath);
          deleteFileIfExists(file.path);

          mediaItems.push({
            fileName,
            url: `/uploads/compressed_webp/${fileName}`,
            mediaType: "image",
            videoStatus: "ready",
            createdAt: new Date(),
          });
        }
      }

      const tags = req.body.mealId ? JSON.parse(req.body.mealId) : [];

      const addonIds = await AddOn.find({
        categoryType: "Decoration",
        $or: [
          {
            eventId: { $in: tags },
          },
          {
            eventId: { $size: 0 },
            productId: { $size: 0 },
          },
        ],
      }).distinct("_id");

      const firstImage = mediaItems.find((m) => m.mediaType === "image");

      const data = new decorationModel({
        name: req.body.name,
        short_link: "",
        featured_image: firstImage ? firstImage.fileName : mediaItems[0]?.fileName,
        featured_images: mediaItems,
        caption: req.body.description || "",
        addons: addonIds,
        badge: null,
        price: req.body.dish_rate || 0,
        cost_price: req.body.price,
        type: null,
        is_wishlisted: null,
        ratings: null,
        attributes: null,
        inclusion: normalizeInclusion(req.body.preperationtext),
        tag: tags,
        vendorMaterialPrice: req.body.vendorMaterialPrice,
        executionPrice: req.body.executionPrice,
        horaAdvance: req.body.horaAdvance,
        inclusionVariables:
          typeof req.body.inclusionVariables === "string"
            ? JSON.parse(req.body.inclusionVariables)
            : req.body.inclusionVariables,
      });

      const saved = await data.save();

      // Trigger background FFmpeg compression after DB save
      queuedVideos.forEach((fileName) => {
        enqueueVideoCompression({
          decorationId: saved._id,
          fileName,
        });
      });

      return res.json({
        error: false,
        status: 200,
        message:
          queuedVideos.length > 0
            ? "Decoration created successfully. Video is compressing in background."
            : "Decoration created successfully",
        data: saved,
      });
    } catch (err) {
      files.forEach((f) => deleteFileIfExists(f.path));
      err.isPublic = true;
      next(err);
    }
  }
);

router.post("/add", async (req, res, next) => {
  try {
    const cuisineId = req.body?.cuisineId?.[0];

    // ------------------------------------
    // CASE 2: PHOTOGRAPHY
    // ------------------------------------
    if (cuisineId === "66c96b2a22ed47b72117e089") {
      const data = new photographyModel({
        name: req.body.name,
        short_link: "",
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
        horaAdvance: req.body.horaAdvance,
        duration: req.body.duration,
      });

      const existing = await photographyModel.findOne({
        name: data.name,
        type: data.type,
      });

      if (existing) {
        return res.json({
          error: true,
          status: 503,
          message: "Photography already added.",
        });
      }

      const savedData = await data.save();
      return res.json({
        error: false,
        status: 200,
        message: "Photography added successfully.",
        data: savedData,
      });
    }

    // ------------------------------------
    // CASE 3: DISH
    // ------------------------------------
    else {
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
        horaAdvance: req.body.horaAdvance,
      });

      // Mongoose 9 safe
      const existingDish = await dishModel.findOne({ name: data.name });

      if (existingDish) {
        return res.json({
          error: true,
          status: 503,
          message: "Already Added",
        });
      }

      const savedData = await data.save();
      return res.json({
        error: false,
        status: 200,
        message: "Added Successfully",
        data: savedData,
      });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.post("/edit", async (req, res, next) => {
  const id = req.body?._id;
  const updatedData = req.body;
  const options = { new: true };

  if (!id) {
    return res.json({
      error: true,
      status: 422,
      message: "_id is required",
    });
  }

  try {
    // If cuisine matches Decoration
    if (req.body?.cuisineId?.[0] === "65a2d129513d9389d34e31d4") {
      console.log(1);

      const result = await decorationModel.findByIdAndUpdate(
        id,
        updatedData,
        options,
      );

      return res.json({
        error: false,
        status: 200,
        message: "Updated Successfully",
        data: result,
      });
    }

    // ELSE update Dish
    const result = await dishModel.findByIdAndUpdate(id, updatedData, options);

    return res.json({
      error: false,
      status: 200,
      message: "Updated Successfully",
      data: result,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/details/:id", async (req, res, next) => {
  try {
    const id = req.params?.id;

    const data = await dishModel.findById(id);

    return res.json({
      error: false,
      status: 200,
      message: "Details Fetch Successfully",
      data: data,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.post("/update_dish_status", async (req, res, next) => {
  const { _id } = req.body;

  // Validation
  if (!_id) {
    return res.json({
      error: true,
      status: 422,
      data: [{ path: "_id", message: "Id is required." }],
    });
  }

  try {
    // Find dish
    const dish = await dishModel.findById(_id);

    if (!dish) {
      return res.json({
        error: true,
        status: 503,
        message: "Details Not Found",
      });
    }

    // Update status
    await dishModel.findByIdAndUpdate(_id, {
      $set: { status: req.body.status },
    });

    return res.json({
      error: false,
      status: 200,
      message: "Status Update Successfully",
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.post("/user_dish_list", async (req, res, next) => {
  let finder = {
    status: 1,
  };
  const { type } = req.body;
  if (!req.body.page) {
    req.body.page = 1;
  }
  if (!req.body.per_page) {
    req.body.per_page = 20;
  }
  if (req.body.name) {
    finder[`name`] = new RegExp(req.body.name.trim(), "i");
  }
  // if (req.body.mealId) {
  //     finder[`mealId`] = req.body.mealId
  // }
  // if (req.body.cuisineId) {
  //     finder[`cuisineId`] = req.body.cuisineId
  // }
  if (req.body.mealId) {
    finder[`mealId`] = { $in: [new ObjectId(req.body.mealId)] };
  }
  if (req.body.cuisineId) {
    finder[`cuisineId`] = { $in: [new ObjectId(req.body.cuisineId)] };
  }
  try {
    const dish = await dishModel.aggregate([
      { $match: finder },
      {
        $lookup: {
          from: "meals",
          localField: "mealId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, _id: 0 } }],
          as: "mealId",
        },
      },
      {
        $lookup: {
          from: "configurations",
          localField: "cuisineId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, _id: 0 } }],
          as: "cuisineId",
        },
      },
      { $sort: { updatedAt: -1 } },
      { $match: { _id: { $nin: [] } } },
      { $skip: Number(req.body.page - 1) * Number(req.body.per_page) },
      { $limit: Number(req.body.per_page) },
    ]);
    let OverallResult = dish;
    const totaldish = await dishModel.count(finder);
    let paginate = {
      total_item: totaldish,
      showing: OverallResult.length,
      first_page: 1,
      previous_page: req.body.per_page,
      current_page: req.body.page,
      next_page: parseInt(req.body.page) + 1,
      last_page: parseInt(totaldish / parseInt(req.body.per_page)),
    };
    if (dish.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Fetch Data Successfully",
        data: { dish: OverallResult, paginate },
      });
    } else {
      return res.json({ error: true, status: 503, message: "No Record Found" });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

var ObjectId = require("mongoose").Types.ObjectId;

router.post("/admin_dish_list", async (req, res, next) => {
  try {
    let finder = {
      status: { $ne: 2 },
    };

    const page = Number(req.body?.page) || 1;
    const perPage = Number(req.body?.per_page) || 20;

    if (req.body?.name) {
      finder.name = new RegExp(req.body.name.trim(), "i");
    }

    if (req.body?.mealId) {
      finder.mealId = { $in: [new ObjectId(req.body.mealId)] };
    }

    if (req.body?.cuisineId) {
      finder.cuisineId = { $in: [new ObjectId(req.body.cuisineId)] };
    }

    if (req.body?.is_dish) {
      finder.is_dish = req.body.is_dish;
    }

    if (req.body?.status) {
      finder.status = req.body.status;
    }

    console.log("finder>>>>>>", finder);
    console.log("req.body>>>>>>", req.body);

    // ---------------------------------------------
    // Fetch dish records
    // ---------------------------------------------
    const dish = await dishModel.aggregate([
      { $match: finder },
      {
        $lookup: {
          from: "meals",
          localField: "mealId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, _id: 0 } }],
          as: "mealId",
        },
      },
      {
        $lookup: {
          from: "configurations",
          localField: "cuisineId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, _id: 0 } }],
          as: "cuisineId",
        },
      },
      { $sort: { updatedAt: -1 } },
      { $skip: (page - 1) * perPage },
      { $limit: perPage },
    ]);

    let OverallResult = dish;

    let totaldish = await dishModel.countDocuments(finder);
    console.log("totaldish", totaldish);

    let decoration = null;

    // ---------------------------------------------
    // If no dish found → Try decorations
    // ---------------------------------------------
    if (totaldish === 0) {
      console.log("A");

      finder.tag = { $in: [new ObjectId(req.body.mealId)] };
      delete finder.mealId;

      decoration = await decorationModel.aggregate([
        { $match: finder },
        {
          $lookup: {
            from: "meals",
            localField: "mealId",
            foreignField: "_id",
            pipeline: [{ $project: { name: 1, _id: 0 } }],
            as: "mealId",
          },
        },
        { $sort: { updatedAt: -1 } },
        { $skip: (page - 1) * perPage },
        { $limit: perPage },
      ]);

      OverallResult = decoration;

      // Remove unwanted keys
      const keysToDelete = [
        "short_link",
        "badge",
        "is_wishlisted",
        "ratings",
        "attributes",
        "mealId",
      ];

      for (let obj of OverallResult) {
        keysToDelete.forEach((key) => delete obj[key]);
      }

      // Rename keys
      const keyReplacements = {
        featured_image: "image",
        caption: "description",
        inclusion: "preperationtext",
        tag: "mealId",
      };

      OverallResult.forEach((obj) => {
        Object.entries(keyReplacements).forEach(([oldKey, newKey]) => {
          obj[newKey] = obj[oldKey];
          delete obj[oldKey];
        });
      });

      totaldish = await decorationModel.countDocuments(finder);
    }

    // ---------------------------------------------
    // Pagination
    // ---------------------------------------------
    const paginate = {
      total_item: totaldish,
      showing: OverallResult.length,
      first_page: 1,
      previous_page: perPage,
      current_page: page,
      next_page: page + 1,
      last_page: Math.ceil(totaldish / perPage),
    };

    // ---------------------------------------------
    // Response
    // ---------------------------------------------
    if (dish.length > 0 || decoration.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Fetch Data Successfully",
        data: { dish: OverallResult, paginate },
      });
    } else {
      return res.json({
        error: true,
        status: 503,
        message: "No Record Found",
      });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/getRandomDishList", async (req, res, next) => {
  let finder = {
    status: 1,
  };
  finder[`name`] = {
    $in: [
      "Paneer Lababdar",
      "Hariyali Kebab",
      "Lachha Parathas",
      "Paneer Tikka",
      "Veg Spring Rolls",
      "Lassi",
      "Sandwich",
      "Virgin Mojito",
      "Pooris & Bedmis",
      "French Fries",
      "Chicken Tikka",
      "Veg Hakka Noodles",
    ],
  };
  var newArray = [];
  try {
    const dish = await dishModel.find(finder);
    dish.forEach((element) => {
      newArray.push({ name: element.name, image: element.image });
    });
    if (dish.length > 0) {
      setTimeout(() => {
        return res.json({
          error: false,
          status: 200,
          message: "Fetch Data Successfully",
          data: newArray,
        });
      }, 1000);
    } else {
      return res.json({ error: true, status: 503, message: "No Record Found" });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/getAllDishesList", async (req, res, next) => {
  try {
    const dishes = await dishModel
      .find({
        cuisineId: { $in: [new mongoose.Types.ObjectId(bulkFoodCuisineId)] },
      })
      .lean();
    return CustomResponse(
      res,
      200,
      false,
      "Dishes fetched successfully",
      dishes,
    );
  } catch (err) {
    error.isPublic = true;
    next(error);
  }
});

module.exports = router;
