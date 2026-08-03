const express = require("express");
const router = express.Router();
const FoodPackage = require("../models/food-package");
const Dish = require("../models/dish");
const { CustomResponse } = require("../store/commonFunction");

// Create food package
router.post("/createFoodPackage", async (req, res, next) => {
  try {
    const { name, image, price, actualPrice, foodType, packageType } = req.body;

    if (!name || !image || !foodType || !packageType) {
      return CustomResponse(
        res,
        400,
        true,
        "name, image, foodType and packageType are required",
      );
    }

    const newPackage = new FoodPackage({
      name,
      image,
      price,
      actualPrice,
      foodType,
      packageType,
    });

    await newPackage.save();

    return CustomResponse(
      res,
      200,
      false,
      "Food package created successfully",
      newPackage,
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Update food package
router.patch("/updateFoodPackage/:id", async (req, res, next) => {
  try {
    const updatedPackage = await FoodPackage.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );

    return CustomResponse(
      res,
      200,
      false,
      "Package updated successfully",
      updatedPackage,
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// GET packages by packageType and packageStatus
router.post("/admin_food_packages_list", async (req, res, next) => {
  try {
    const { page, per_page, name, packageType, packageStatus } = req.body;

    let query = {};

    // search by name
    if (name) {
      query.name = { $regex: name, $options: "i" };
    }

    // filter by package type
    if (packageType) {
      query.packageType = packageType;
    }

    // filter by status
    if (packageStatus !== undefined && packageStatus !== "") {
      query.packageStatus = parseInt(packageStatus);
    }

    const currentPage = page ? parseInt(page) : 1;
    const limit = per_page ? parseInt(per_page) : 10;
    const skip = (currentPage - 1) * limit;

    const packages = await FoodPackage.find(query)
      .populate("packageItems")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await FoodPackage.countDocuments(query);

    const paginate = {
      total_item: total,
      showing: packages.length,
      first_page: 1,
      previous_page: currentPage > 1 ? currentPage - 1 : 1,
      current_page: currentPage,
      next_page:
        currentPage < Math.ceil(total / limit)
          ? currentPage + 1
          : Math.ceil(total / limit),
      last_page: Math.ceil(total / limit),
    };

    return CustomResponse(res, 200, false, "Packages fetched successfully", {
      dish: packages,
      paginate,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Add new dish to package
router.post("/addDishToPackage", async (req, res, next) => {
  try {
    const { packageId, dishIds } = req.body;

    if (!packageId || !Array.isArray(dishIds) || dishIds.length === 0) {
      return CustomResponse(
        res,
        400,
        true,
        "packageId and dishIds array are required",
      );
    }

    // update package (add unique dishes)
    const packageUpdate = await FoodPackage.findByIdAndUpdate(
      packageId,
      {
        $addToSet: { packageItems: { $each: dishIds } },
      },
      { new: true },
    );

    if (!packageUpdate) {
      return CustomResponse(res, 404, true, "Package not found");
    }

    // update all dishes with packageId
    await Dish.updateMany(
      { _id: { $in: dishIds } },
      {
        $addToSet: { packageIds: packageId },
      },
    );

    return CustomResponse(
      res,
      200,
      false,
      "Dishes added to package successfully",
      packageUpdate,
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// Remove dish from package
router.post("/removeDishFromPackage", async (req, res, next) => {
  try {
    const { packageId, dishId } = req.body;

    if (!packageId || !dishId) {
      return CustomResponse(
        res,
        400,
        true,
        "packageId and dishId are required",
      );
    }

    // remove dish from packageItems
    const packageUpdate = await FoodPackage.findByIdAndUpdate(
      packageId,
      {
        $pull: { packageItems: dishId },
      },
      { new: true },
    );

    if (!packageUpdate) {
      return CustomResponse(res, 404, true, "Package not found");
    }

    // remove packageId from dish
    await Dish.findByIdAndUpdate(
      dishId,
      {
        $pull: { packageIds: packageId },
      },
      { new: true },
    );

    return CustomResponse(
      res,
      200,
      false,
      "Dish removed from package successfully",
      packageUpdate,
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/getAllFoodPackageList", async (req, res, next) => {
  try {
    const { packageType, foodType } = req.query;

    let query = {
      packageStatus: 1,
    };

    // filter by package type
    if (packageType) {
      query.packageType = packageType;
    }
    if (foodType) {
      query.foodType = foodType;
    }

    const packages = await FoodPackage.find(query)
      .populate("packageItems")
      .sort({ createdAt: -1 });

    return CustomResponse(
      res,
      200,
      false,
      "Packages fetched successfully",
      packages,
    );
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

module.exports = router;
