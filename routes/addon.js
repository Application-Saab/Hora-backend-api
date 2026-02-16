const express = require('express');
const mongoose = require('mongoose');
const AddOn = require('../models/addon');

const router = express.Router();

const multer = require('multer');
const fs =require("fs");

const { uploadFileToS3 } =require("../store/multerS3Config"); // adjust path

const upload = multer({ dest: "uploads/" });

router.post('/add', upload.single("image"), async (req, res) => {
    try {
        const {
            title,
            price,
            description,
            productId,
            productType,
            categoryType,
            eventType
        } = req.body;

        if (!title || !price) {
            return res.status(400).json({
                error: true,
                message: "title and price are required"
            });
        }

        let imageUrl = null;

        if (req.file) {
            const result = await uploadFileToS3(
                req.file.path,
                req.file.originalname,
                "addons",
                "9999999999",
                req.file.mimetype
            );

            imageUrl = result.Location;

            fs.unlinkSync(req.file.path); // delete local file
        }

        const newAddOn = new AddOn({
            title,
            price,
            description,
            image: imageUrl,
            productId: productId || null,
            productType: productType || null,
            categoryType: categoryType || null,
            eventType: eventType || null
        });

        const savedData = await newAddOn.save();

        return res.status(201).json({
            error: false,
            message: "AddOn Added Successfully",
            data: savedData
        });

    } catch (error) {
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



module.exports = router;
