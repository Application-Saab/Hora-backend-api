const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Theme = require('../models/photography-theme');
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
        message: "Invalid Theme ID",
      });
    }

    const existingTheme = await Theme.findById(id);

    if (!existingTheme) {
      return res.status(404).json({
        error: true,
        message: "Theme not found",
      });
    }

    const updatedTheme = await Theme.findByIdAndUpdate(
      id,
      { title, price, image },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Theme updated successfully",
      data: updatedTheme,
    });
  } catch (error) {
    next(error);
  }
});

// ----------------- ADD Theme -----------------
router.post('/add', async (req, res, next) => {
  try {
    const { title, price, description, image, productId, categoryType, productType, eventType } = req.body;

    // ---------------- VALIDATION ----------------
    if (!title || !price || !image) {
      return res.status(400).json({
        error: true,
        message: "title, price, and image are required"
      });
    }

    if (!productId && !categoryType && !eventType) {
      return res.status(400).json({
        error: true,
        message: "At least one of productId, categoryType, or eventType must be provided"
      });
    }



    // ---------------- CREATE Theme ----------------
    const newTheme = new Theme({
      title,
      price,
      description,
      image,
      categoryType,
      eventId: eventType,
    });

    const savedTheme = await newTheme.save();

    // ---------------- LINK Theme ----------------
    if (productId) {
      // Single product update
    if (productType === "Photography") {
        await Photography.updateOne(
          { _id: productId },
          { $addToSet: { ThemesId: savedTheme._id } }
        );
      }
    } else if (eventType) {
       if (categoryType === "Photography") {
           await Photography.updateMany(
               { tag: eventType },
               { $addToSet: { ThemesId: savedTheme._id } }
           );
      }
    } else if (categoryType) {
       if (categoryType === "Photography") {
           await Photography.updateMany(
               {}, // all photography
               { $addToSet: { ThemesId: savedTheme._id } }
           );
      }
    }

    return res.status(201).json({
      error: false,
      message: "Theme added successfully and linked to products",
      data: savedTheme
    });

  } catch (error) {
    next(error);
  }
});
 
router.get('/getAll', async (req, res, next) => {
  try {
    const Themes = await Theme.find().sort({ createdAt: -1 });
    return res.status(200).json({
      error: false,
      message: "All Themes fetched successfully",
      data: Themes
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
        message: "Theme ID required",
      });
    }

    // Remove from Photography
      await Photography.updateMany(
          { ThemesId: id },
          { $pull: { ThemesId: id } }
      );

    // Delete from Theme collection
    await Theme.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Theme deleted successfully",
    });

  } catch (error) {
    next(error);
  }
});

// ----------------- GET Theme(S) -----------------
router.get('/get', async (req, res, next) => {
  try {
    let { ids } = req.query;

    if (!ids || ids.length === 0) {
      return res.status(400).json({
        error: true,
        message: "At least one Theme ID is required"
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
        message: "No valid Theme IDs provided"
      });
    }

    // Fetch Themes
    const Themes = await Theme.find({ _id: { $in: validIds } });

    return res.status(200).json({
      error: false,
      message: "Theme(s) fetched successfully",
      data: Themes
    });

  } catch (error) {
    next(error);
  }
});


module.exports = router;
