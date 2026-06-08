const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const VenuePackageItems = require("../models/venue-package-items");
const VenuePackageCategories = require("../models/venue-package-categories");

const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });


// =============================================
// CREATE PACKAGE ITEM
// =============================================
router.post("/create-item", async (req, res) => {
  try {
    const {
      title,
      foodType,
      categoryIds,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        error: true,
        message: "Title is required",
      });
    }

    if (
      foodType &&
      !["veg", "non-veg", "mixed"].includes(
        foodType,
      )
    ) {
      return res.status(400).json({
        error: true,
        message: "Invalid food type",
      });
    }

    if (
      categoryIds &&
      Array.isArray(categoryIds)
    ) {
      const invalidIds = categoryIds.filter(
        (id) =>
          !mongoose.Types.ObjectId.isValid(
            id,
          ),
      );

      if (invalidIds.length) {
        return res.status(400).json({
          error: true,
          message:
            "Invalid category ids",
        });
      }
    }

    const item =
      await VenuePackageItems.create({
        title,
        foodType,
        categoryIds,
      });

    return res.status(201).json({
      error: false,
      message:
        "Package item created successfully",
      data: item,
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
// GET ALL PACKAGE ITEMS
// =============================================
router.get("/items-list", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      foodType = "",
      categoryId = "",
      itemsStatus = "",
    } = req.query;

    const query = {
      itemsStatus: {
        $ne: 3,
      },
    };

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    if (foodType) {
      query.foodType = foodType;
    }

    if (
      categoryId &&
      mongoose.Types.ObjectId.isValid(
        categoryId,
      )
    ) {
      query.categoryIds = categoryId;
    }

    if (itemsStatus) {
      query.itemsStatus =
        Number(itemsStatus);
    }

    const skip =
      (Number(page) - 1) * Number(limit);

    const items =
      await VenuePackageItems.find(query)
        .populate(
          "categoryIds",
          "title",
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    const total =
      await VenuePackageItems.countDocuments(
        query,
      );

    return res.status(200).json({
      error: false,
      message:
        "Items fetched successfully",
      data: items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(
          total / limit,
        ),
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
// GET ITEM DETAILS
// =============================================
router.get(
  "/item-details/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          error: true,
          message: "Invalid item id",
        });
      }

      const item =
        await VenuePackageItems.findById(
          id,
        )
          .populate(
            "categoryIds",
            "title",
          )
          .lean();

      if (!item) {
        return res.status(404).json({
          error: true,
          message: "Item not found",
        });
      }

      return res.status(200).json({
        error: false,
        message:
          "Item fetched successfully",
        data: item,
      });
    } catch (err) {
      console.log(err);

      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);

// =============================================
// UPDATE ITEM
// =============================================
router.put(
  "/item-details/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          error: true,
          message: "Invalid item id",
        });
      }

      const item =
        await VenuePackageItems.findById(
          id,
        );

      if (!item) {
        return res.status(404).json({
          error: true,
          message: "Item not found",
        });
      }

      const {
        title,
        foodType,
        categoryIds,
        itemsStatus,
      } = req.body;

      if (title !== undefined)
        item.title = title;

      if (foodType !== undefined)
        item.foodType = foodType;

      if (categoryIds !== undefined)
        item.categoryIds =
          categoryIds;

      if (itemsStatus !== undefined)
        item.itemsStatus =
          itemsStatus;

      const updated =
        await item.save();

      return res.status(200).json({
        error: false,
        message:
          "Item updated successfully",
        data: updated,
      });
    } catch (err) {
      console.log(err);

      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);

// =============================================
// DELETE ITEM
// =============================================
router.delete(
  "/item-details/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          error: true,
          message: "Invalid item id",
        });
      }

      const item =
        await VenuePackageItems.findById(
          id,
        );

      if (!item) {
        return res.status(404).json({
          error: true,
          message: "Item not found",
        });
      }

      item.itemsStatus = 3;

      await item.save();

      return res.status(200).json({
        error: false,
        message:
          "Item deleted successfully",
      });
    } catch (err) {
      console.log(err);

      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);

// =============================================
// ITEMS DROPDOWN
// =============================================
router.get(
  "/items-dropdown",
  async (req, res) => {
    try {
      const {
        foodType,
        categoryId,
      } = req.query;

      const query = {
        itemsStatus: 1,
      };

      if (foodType) {
        query.foodType = foodType;
      }

      if (
        categoryId &&
        mongoose.Types.ObjectId.isValid(
          categoryId,
        )
      ) {
        query.categoryIds =
          categoryId;
      }

      const items =
        await VenuePackageItems.find(
          query,
        )
          .select(
            "title foodType",
          )
          .sort({
            title: 1,
          })
          .lean();

      return res.status(200).json({
        error: false,
        data: items,
      });
    } catch (err) {
      return res.status(500).json({
        error: true,
        message: "Server Error",
      });
    }
  },
);


module.exports = router;
