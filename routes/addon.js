const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AddOn = require('../models/addon');
const Decoration = require('../models/decoration');
const Photography = require('../models/photography');
const fs = require("fs");
const path = require("path");

router.put("/edit/:id", async (req, res) => {
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

    if (image && existingAddon.image !== image) {

      // Old image full path
      const oldImagePath = path.join(
        __dirname,
        "../uploads/compressed_webp",
        existingAddon.image
      );

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

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
    console.error("Error updating AddOn:", error);
    return res.status(500).json({
      error: true,
      message: error.message,
    });
  }
});


// ----------------- ADD ADDON -----------------
router.post('/add', async (req, res) => {
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

    // ---------------- CREATE ADDON ----------------
    const newAddOn = new AddOn({
      title,
      price,
      description,
      image,
      categoryType
    });

    const savedAddOn = await newAddOn.save();

    // ---------------- LINK ADDON ----------------
    if (productId) {
      // Single product update
      if (productType === "Decoration") {
        await Decoration.updateOne(
          { _id: productId },
          { $addToSet: { addons: savedAddOn._id } }
        );
      } else if (productType === "Photography") {
        await Photography.updateOne(
          { _id: productId },
          { $addToSet: { addons: savedAddOn._id } }
        );
      }
    } else if (eventType) {
      if (categoryType === "Decoration") {
        await Decoration.updateMany(
          { tag: eventType },
          { $addToSet: { addons: savedAddOn._id } }
        );
      } else if (categoryType === "Photography") {
        await Photography.updateMany(
          { tag: eventType },
          { $addToSet: { addons: savedAddOn._id } }
        );
      }
    } else if (categoryType) {
      if (categoryType === "Decoration") {
        await Decoration.updateMany(
          {}, // all decorations
          { $addToSet: { addons: savedAddOn._id } }
        );
      } else if (categoryType === "Photography") {
        await Photography.updateMany(
          {}, // all photography
          { $addToSet: { addons: savedAddOn._id } }
        );
      }
    }

    return res.status(201).json({
      error: false,
      message: "AddOn added successfully and linked to products",
      data: savedAddOn
    });

  } catch (error) {
    console.error("Error adding AddOn:", error);
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

router.get('/getAll', async (req, res) => {
  try {
    const addons = await AddOn.find().sort({ createdAt: -1 });
    return res.status(200).json({
      error: false,
      message: "All AddOns fetched successfully",
      data: addons
    });
  } catch (error) {
    console.error("Error fetching all AddOns:", error);
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

router.post("/delete/:id", async (req, res) => {
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

    const addon = await AddOn.findById(id);
    if (addon && addon.image) {
      const imagePath = path.join(__dirname, "../uploads/compressed_webp", addon.image);

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    await AddOn.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "AddOn deleted successfully",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: true,
      message: error.message,
    });
  }
});


// ----------------- GET ADDON(S) -----------------
router.get('/get', async (req, res) => {
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
    console.error("Error fetching AddOn(s):", error);
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
});


module.exports = router;
