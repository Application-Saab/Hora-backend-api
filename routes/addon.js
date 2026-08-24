const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AddOn = require('../models/addon');
const Decoration = require('../models/decoration');
const Photography = require('../models/photography');
const fs = require("fs");
const path = require("path");

router.put("/edit/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, price, image } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid AddOn ID",
      });
    }

    const existingAddon = await AddOn.findById(id);

    if (!existingAddon) {
      return res.status(404).json({
        error: true,
        message: "AddOn not found",
      });
    }

    const updatedAddOn = await AddOn.findByIdAndUpdate(
      id,
      { title, price, image },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "AddOn updated successfully",
      data: updatedAddOn,
    });
  } catch (error) {
    next(error);
  }
});

// ----------------- ADD ADDON -----------------
router.post("/add", async (req, res, next) => {
  try {
    const {
      title,
      price,
      description,
      image,
      productId,
      categoryType,
      eventType,
    } = req.body;

    // ---------------- VALIDATION ----------------
    if (!title || !price || !image) {
      return res.status(400).json({
        error: true,
        message: "title, price, and image are required",
      });
    }

    const hasProducts =
      Array.isArray(productId) && productId.length > 0;

    const hasEvents =
      Array.isArray(eventType) && eventType.length > 0;

    if (!hasProducts && !hasEvents && !categoryType) {
      return res.status(400).json({
        error: true,
        message:
          "At least one of productId, categoryType, or eventType must be provided",
      });
    }

    // ---------------- CREATE ADDON ----------------
    const newAddOn = new AddOn({
      title,
      price,
      description,
      image,
      productId,
      categoryType,

      ...(hasProducts
        ? {}
        : hasEvents
          ? { eventId: eventType }
          : {}),
    });

    const savedAddOn = await newAddOn.save();

    // =====================================================
    // 1. PRODUCT SELECTED
    // =====================================================
    if (hasProducts) {
      if (categoryType === "Photography") {
        await Photography.updateMany(
          {
            _id: { $in: productId },
          },
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      } else if (categoryType === "Decoration") {
        await Decoration.updateMany(
          {
            _id: { $in: productId },
          },
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 2. EVENT SELECTED
    // =====================================================
    else if (hasEvents) {
      if (categoryType === "Decoration") {
        await Decoration.updateMany(
          {
            tag: { $in: eventType },
          },
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      } else if (categoryType === "Photography") {
        await Photography.updateMany(
          {
            tag: { $in: eventType },
          },
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 3. ALL PRODUCTS OF CATEGORY
    // =====================================================
    else if (categoryType) {
      if (categoryType === "Decoration") {
        await Decoration.updateMany(
          {},
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      } else if (categoryType === "Photography") {
        await Photography.updateMany(
          {},
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      }
    }

    return res.status(201).json({
      error: false,
      message: "AddOn added successfully and linked to products",
      data: savedAddOn,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/getAll', async (req, res, next) => {
  try {
    const addons = await AddOn.find().sort({ createdAt: -1 });
    return res.status(200).json({
      error: false,
      message: "All AddOns fetched successfully",
      data: addons
    });
  } catch (error) {
    next(error);
  }
});

router.post("/delete/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: true,
        message: "AddOn ID required",
      });
    }

    // Remove from Decoration
    await Decoration.updateMany(
      { addons: id },
      { $pull: { addons: id } }
    );

    // Remove from Photography
    await Photography.updateMany(
      { addons: id },
      { $pull: { addons: id } }
    );

    // Delete from AddOn collection
    await AddOn.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "AddOn deleted successfully",
    });

  } catch (error) {
    next(error);
  }
});

// ----------------- GET ADDON(S) -----------------
router.get('/get', async (req, res, next) => {
  try {
    let { ids } = req.query;

    if (!ids || ids.length === 0) {
      return res.status(400).json({
        error: true,
        message: "At least one addon ID is required"
      });
    }

    if (!Array.isArray(ids)) {
      ids = [ids];
    }

    // Validate IDs
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        error: true,
        message: "No valid addon IDs provided"
      });
    }

    // Fetch addons
    const addons = await AddOn.find({ _id: { $in: validIds } });

    return res.status(200).json({
      error: false,
      message: "AddOn(s) fetched successfully",
      data: addons
    });

  } catch (error) {
    next(error);
  }
});


module.exports = router;
