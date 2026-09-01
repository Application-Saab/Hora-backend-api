const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Theme = require('../models/photography-theme');
const Photography = require('../models/photography');
const Meal = require("../models/meal");

router.put("/edit/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      title,
      image,
      eventId,
      productId,
      categoryType,
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

    const oldProductIds = Array.isArray(existingTheme.productId)
      ? existingTheme.productId.map((id) => id.toString())
      : [];

    const oldCategoryTypes = Array.isArray(existingTheme.categoryType)
      ? existingTheme.categoryType
      : [];

    const newEventIds = Array.isArray(eventId)
      ? eventId.map((id) => id.toString())
      : [];

    const newProductIds = Array.isArray(productId)
      ? productId.map((id) => id.toString())
      : [];

    const newCategoryTypes = Array.isArray(categoryType)
      ? categoryType
      : [];

    const isOldGenericTheme =
      oldEventIds.length === 0 && oldProductIds.length === 0;

    let effectiveOldEventIds = oldEventIds;

    if (isOldGenericTheme) {
      const allEvents = await Meal.find({}, "_id").lean();
      effectiveOldEventIds = allEvents.map((event) => event._id.toString());
    }

    const removedEventIds = effectiveOldEventIds.filter(
      (oldId) => !newEventIds.includes(oldId)
    );

    const addedEventIds = newEventIds.filter(
      (newId) => !effectiveOldEventIds.includes(newId)
    );

    const photographyRemoved =
      oldCategoryTypes.includes("Photography") &&
      !newCategoryTypes.includes("Photography");

    const photographyAdded =
      !oldCategoryTypes.includes("Photography") &&
      newCategoryTypes.includes("Photography");

    if (removedEventIds.length > 0) {
      const removeQueryExtra =
        oldProductIds.length > 0 ? { _id: { $in: oldProductIds } } : {};

      if (oldCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: removedEventIds },
            ThemesId: existingTheme._id,
            ...removeQueryExtra,
          },
          { $pull: { ThemesId: existingTheme._id } }
        );
      }
    }

    if (addedEventIds.length > 0) {
      const addQuery =
        newProductIds.length > 0
          ? { tag: { $in: addedEventIds }, _id: { $in: newProductIds } }
          : { tag: { $in: addedEventIds } };

      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(addQuery, {
          $addToSet: { ThemesId: existingTheme._id },
        });
      }
    }

    if (photographyRemoved) {
      await Photography.updateMany(
        { ThemesId: existingTheme._id },
        { $pull: { ThemesId: existingTheme._id } }
      );
    }

    const removedProductIds = oldProductIds.filter(
      (oldId) => !newProductIds.includes(oldId)
    );

    const addedProductIds = newProductIds.filter(
      (newId) => !oldProductIds.includes(newId)
    );

    if (removedProductIds.length > 0) {
      if (oldCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          { _id: { $in: removedProductIds }, ThemesId: existingTheme._id },
          { $pull: { ThemesId: existingTheme._id } }
        );
      }
    }

    if (addedProductIds.length > 0) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          { _id: { $in: addedProductIds } },
          { $addToSet: { ThemesId: existingTheme._id } }
        );
      }
    }

    if (photographyAdded && newEventIds.length > 0) {
      const query =
        newProductIds.length > 0
          ? { tag: { $in: newEventIds }, _id: { $in: newProductIds } }
          : { tag: { $in: newEventIds } };

      await Photography.updateMany(query, {
        $addToSet: { ThemesId: existingTheme._id },
      });
    }

    const isNewGenericTheme =
      newEventIds.length === 0 && newProductIds.length === 0;

    if (isNewGenericTheme) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {},
          { $addToSet: { ThemesId: existingTheme._id } }
        );
      }
    }

    const isNewEventLevelTheme =
      newEventIds.length > 0 && newProductIds.length === 0;

    if (isNewEventLevelTheme) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          { tag: { $in: newEventIds } },
          { $addToSet: { ThemesId: existingTheme._id } }
        );
      }
    }

    const updatedTheme = await Theme.findByIdAndUpdate(
      id,
      {
        title,
        image,
        eventId: newEventIds,
        productId: newProductIds,
        categoryType: newCategoryTypes,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Theme updated successfully",
      data: updatedTheme,
    });
  } catch (error) {
    console.error("Edit Theme Error:", error);
    next(error);
  }
});

// ----------------- ADD Theme -----------------
router.post("/add", async (req, res, next) => {
  try {
    const {
      title,
      description,
      image,
      productId,
      categoryType,
      eventType,
    } = req.body;

    // ---------------- VALIDATION ----------------
    if (!title || !image) {
      return res.status(400).json({
        error: true,
        message: "title, and image are required",
      });
    }

    const hasProducts =
      Array.isArray(productId) && productId.length > 0;

    const hasEvents =
      Array.isArray(eventType) && eventType.length > 0;

    const hasCategories =
      Array.isArray(categoryType) && categoryType.length > 0;

    if (!hasProducts && !hasEvents && !hasCategories) {
      return res.status(400).json({
        error: true,
        message:
          "At least one of productId, categoryType, or eventType must be provided",
      });
    }

    // ---------------- CREATE THEME ----------------
    const newTheme = new Theme({
      title,
      description,
      image,

      productId: Array.isArray(productId)
        ? productId
        : [],

      categoryType: Array.isArray(categoryType)
        ? categoryType
        : [],

      eventId: hasEvents
        ? eventType.map((event) =>
          typeof event === "object"
            ? event.id
            : event
        )
        : [],
    });

    const savedTheme = await newTheme.save();

    if (hasProducts) {
      if (categoryType.includes("Photography")) {
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
      const eventObjectIds = eventType.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      if (categoryType.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: eventObjectIds },
          },
          {
            $addToSet: {
              ThemesId: savedTheme._id,
            },
          }
        );
      }
    }
    else if (hasCategories) {

      if (categoryType.includes("Photography")) {
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