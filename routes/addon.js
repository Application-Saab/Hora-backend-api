const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AddOn = require('../models/addon');
const Decoration = require('../models/decoration');
const Photography = require('../models/photography');

// ----------------- ADD ADDON -----------------
router.post('/add', async (req, res) => {
  try {
    const { title, price, description, image, productId, categoryType, productType, eventType } = req.body;

    console.log("REQ BODY:", req.body);
console.log("eventType from frontend:", eventType);
console.log("categoryType from frontend:", categoryType);


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
      image,          // just filename
      productId: productId || null,
      categoryType: categoryType || null,
      eventType: eventType || null
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
      // eventType ke basis pe filter kar ke add kare
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

router.get("/getAddon", async (req, res) => {
  try {
    const { productId, productType, categoryType, eventType } = req.query;

    const conditions = [];

    // Product based
    if (productId && productType) {
      conditions.push({
        productId,
        productType
      });
    }

    // Category based
    if (categoryType) {
      conditions.push({
        categoryType
      });
    }

    // Event based
    if (eventType) {
      conditions.push({
        eventType
      });
    }

    const filter = conditions.length ? { $or: conditions } : {};

    const addons = await AddOn.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: addons.length,
      data: addons
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
});

// ----------------- GET ADDON(S) -----------------
router.get('/get', async (req, res) => {
  try {
    // frontend array bhejega: ?ids[]=id1&ids[]=id2 ...
    let { ids } = req.query;

    if (!ids || ids.length === 0) {
      return res.status(400).json({
        error: true,
        message: "At least one addon ID is required"
      });
    }

    // Agar string aaya, convert to array
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
