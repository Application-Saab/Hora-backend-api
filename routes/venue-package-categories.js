const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Venues = require("../models/party-venue");
const VenuePackageCategory = require("../models/venue-package-categories");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

// =============================================
// CREATE CATEGORY
// =============================================
router.post("/create-category", async (req, res) => {
  try {
    const { title } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        error: true,
        message: "Category title is required",
      });
    }

    const existing = await VenuePackageCategory.findOne({
      title: title.trim(),
      categoriesStatus: { $ne: 3 },
    });

    if (existing) {
      return res.status(409).json({
        error: true,
        message: "Category already exists",
      });
    }

    const category = await VenuePackageCategory.create({
      title: title.trim(),
    });

    return res.status(201).json({
      error: false,
      message: "Category created successfully",
      data: category,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// GET ALL CATEGORIES
// =============================================
router.get("/categories-list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      categoriesStatus = "",
    } = req.query;

    const query = {
      categoriesStatus: {
        $ne: 3,
      },
    };

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    if (categoriesStatus) {
      query.categoriesStatus = Number(categoriesStatus);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const categories = await VenuePackageCategory.find(query)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await VenuePackageCategory.countDocuments(query);

    return res.status(200).json({
      error: false,
      message: "Categories fetched successfully",
      data: categories,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// GET CATEGORY DETAILS
// =============================================
router.get("/category-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid category id",
      });
    }

    const category = await VenuePackageCategory.findById(id).lean();

    if (!category) {
      return res.status(404).json({
        error: true,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      error: false,
      message: "Category fetched successfully",
      data: category,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// UPDATE CATEGORY
// =============================================
router.put("/category-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid category id",
      });
    }

    const category = await VenuePackageCategory.findById(id);

    if (!category) {
      return res.status(404).json({
        error: true,
        message: "Category not found",
      });
    }

    const { title, categoriesStatus } = req.body;

    if (title !== undefined) {
      category.title = title.trim();
    }

    if (categoriesStatus !== undefined) {
      category.categoriesStatus = categoriesStatus;
    }

    const updated = await category.save();

    return res.status(200).json({
      error: false,
      message: "Category updated successfully",
      data: updated,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// DELETE CATEGORY
// =============================================
router.delete("/category-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid category id",
      });
    }

    const category = await VenuePackageCategory.findById(id);

    if (!category) {
      return res.status(404).json({
        error: true,
        message: "Category not found",
      });
    }

    category.categoriesStatus = 3;

    await category.save();

    return res.status(200).json({
      error: false,
      message: "Category deleted successfully",
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

// =============================================
// CATEGORY DROPDOWN
// =============================================
router.get("/categories-dropdown", async (req, res) => {
  try {
    const categories = await VenuePackageCategory.find({
      categoriesStatus: 1,
    })
      .select("title")
      .sort({ title: 1 })
      .lean();

    return res.status(200).json({
      error: false,
      data: categories,
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: "Server Error",
    });
  }
});

module.exports = router;
