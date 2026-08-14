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
const multer = require("multer");
const sharp = require("sharp");
const AddOn = require("../models/addon");

const storage = multer.memoryStorage();
const upload = multer({ storage });

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

const normalizeInclusion = (inclusion) => {
  if (!inclusion) return [];

  try {
    // Case 1:
    // '["<div>...</div>"]'
    if (typeof inclusion === "string" && inclusion.startsWith("[")) {
      inclusion = JSON.parse(inclusion);
    }

    // Case 2:
    // "<div>...</div>"
    if (typeof inclusion === "string") {
      return [inclusion];
    }

    // Case 3:
    // ["<div>...</div>"]
    if (Array.isArray(inclusion)) {
      return [
        inclusion
          .filter(Boolean)
          .join("")
      ];
    }

    return [];
  } catch (err) {
    console.error("normalizeInclusion error", err);
    return [];
  }
};

router.post(
  "/decoration/add",
  upload.array("featured_images", 10),
  async (req, res, next) => {
    try {
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          error: true,
          message: "At least 1 image required",
        });
      }

      const outputFolder = path.resolve(
        __dirname,
        "../uploads/compressed_webp",
      );

      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      // 🧠 PROCESS ALL IMAGES
      const images = [];

      for (let file of files) {
        const fileName = `${Date.now()}-${path.parse(file.originalname).name}.webp`;
        const outputPath = path.join(outputFolder, fileName);

        await compressImageToWebP(file.buffer, outputPath);

        images.push({
          fileName,
        });
      }

      const existing = await decorationModel.findOne({
        name: req.body.name,
      });

      if (existing) {
        return res.json({
          error: true,
          status: 503,
          message: "Decoration already exists",
        });
      }


          const addonIds = await AddOn.find({
              eventId: { $in: tag }
          });

      const data = new decorationModel({
        name: req.body.name,
        short_link: "",
        addons: addonIds,
        featured_images: images, // 👈 MAIN CHANGE
        caption: req.body.description || "",
        badge: null,
        price: req.body.dish_rate || 0,
        cost_price: req.body.price,
        type: null,
        is_wishlisted: null,
        ratings: null,
        attributes: null,
        inclusion: normalizeInclusion(
           req.body.preperationtext,
        ),
        tag: req.body.mealId ? JSON.parse(req.body.mealId) : [],
        vendorMaterialPrice: req.body.vendorMaterialPrice,
        executionPrice: req.body.executionPrice,
        horaAdvance: req.body.horaAdvance,
        inclusionVariables:
          typeof req.body.inclusionVariables === "string"
            ? JSON.parse(req.body.inclusionVariables)
            : req.body.inclusionVariables,
      });

      const saved = await data.save();

      return res.json({
        error: false,
        status: 200,
        message: "Decoration created successfully",
        data: saved,
      });
    } catch (err) {
    error.isPublic = true;
    next(error);
    }
  },
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
