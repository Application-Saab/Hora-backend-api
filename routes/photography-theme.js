const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Theme = require('../models/photography-theme');
const Photography = require('../models/photography');
const Meal = require("../models/meal");
const fs = require("fs");
const path = require("path");

router.put("/edit/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      price,
      image,
      eventId,
    } = req.body;

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

    const oldEventIds = Array.isArray(existingTheme.eventId)
      ? existingTheme.eventId.map((id) => id.toString())
      : [];

    const productIds = Array.isArray(existingTheme.productId)
      ? existingTheme.productId
      : [];

    const isGenericTheme =
      oldEventIds.length === 0 &&
      productIds.length === 0;

    let effectiveOldEventIds = oldEventIds;

    if (isGenericTheme) {
      const allEvents = await Meal.find({}, "_id").lean();

      effectiveOldEventIds = allEvents.map(
        (event) => event._id.toString()
      );
    }

    const newEventIds = Array.isArray(eventId)
      ? eventId.map((id) => id.toString())
      : [];

    const removedEventIds = effectiveOldEventIds.filter(
      (oldId) => !newEventIds.includes(oldId)
    );

    const addedEventIds = newEventIds.filter(
      (newId) => !effectiveOldEventIds.includes(newId)
    );

    if (removedEventIds.length > 0) {
      if (existingTheme.categoryType?.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: removedEventIds },
          },
          {
            $pull: {
              ThemesId: existingTheme._id,
            },
          }
        );
      }
    }


    if (addedEventIds.length > 0) {
      if (existingTheme.categoryType?.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: addedEventIds },
          },
          {
            $addToSet: {
              ThemesId: existingTheme._id,
            },
          }
        );
      }
    }


    const updatedTheme = await Theme.findByIdAndUpdate(
      id,
      {
        title,
        price,
        image,
        eventId: newEventIds,
      },
      {
        new: true,
      }
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

    // ---------------- CREATE Theme ----------------
    const newTheme = new Theme({
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

    const savedTheme = await newTheme.save();

    if (hasProducts) {
      if (categoryType === "Photography") {
        await Photography.updateMany(
          {
            _id: { $in: productId },
          },
          {
            $addToSet: {
              ThemesId: savedTheme._id,
            },
          }
        );
      }
    }

    else if (hasEvents) {
    if (categoryType === "Photography") {
        await Photography.updateMany(
          {
            tag: { $in: eventType },
          },
          {
            $addToSet: {
              ThemesId: savedTheme._id,
            },
          }
        );
      }
    }

    else if (categoryType) {
    if (categoryType === "Photography") {
        await Photography.updateMany(
          {},
          {
            $addToSet: {
              ThemesId: savedTheme._id,
            },
          }
        );
      }
    }

    return res.status(201).json({
      error: false,
      message: "Theme added successfully and linked to products",
      data: savedTheme,
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
