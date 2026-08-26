const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AddOn = require('../models/addon');
const Decoration = require('../models/decoration');
const Photography = require('../models/photography');
const Meal = require("../models/meal");

router.put("/edit/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      title,
      price,
      image,
      eventId,
      productId,
      categoryType,
    } = req.body;

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

    const oldEventIds = Array.isArray(existingAddon.eventId)
      ? existingAddon.eventId.map((id) => id.toString())
      : [];

    const oldProductIds = Array.isArray(existingAddon.productId)
      ? existingAddon.productId.map((id) => id.toString())
      : [];

    const oldCategoryTypes = Array.isArray(existingAddon.categoryType)
      ? existingAddon.categoryType
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

    const isOldGenericAddon =
      oldEventIds.length === 0 && oldProductIds.length === 0;

    let effectiveOldEventIds = oldEventIds;

    if (isOldGenericAddon) {
      const allEvents = await Meal.find({}, "_id").lean();
      effectiveOldEventIds = allEvents.map((event) => event._id.toString());
    }

    const removedEventIds = effectiveOldEventIds.filter(
      (oldId) => !newEventIds.includes(oldId)
    );

    const addedEventIds = newEventIds.filter(
      (newId) => !effectiveOldEventIds.includes(newId)
    );

    const decorationRemoved =
      oldCategoryTypes.includes("Decoration") &&
      !newCategoryTypes.includes("Decoration");

    const photographyRemoved =
      oldCategoryTypes.includes("Photography") &&
      !newCategoryTypes.includes("Photography");

    const decorationAdded =
      !oldCategoryTypes.includes("Decoration") &&
      newCategoryTypes.includes("Decoration");

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
            addons: existingAddon._id,
            ...removeQueryExtra,
          },
          { $pull: { addons: existingAddon._id } }
        );
      }

      if (oldCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            tag: { $in: removedEventIds },
            addons: existingAddon._id,
            ...removeQueryExtra,
          },
          { $pull: { addons: existingAddon._id } }
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
          $addToSet: { addons: existingAddon._id },
        });
      }

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(addQuery, {
          $addToSet: { addons: existingAddon._id },
        });
      }
    }

    if (decorationRemoved) {
      await Decoration.updateMany(
        { addons: existingAddon._id },
        { $pull: { addons: existingAddon._id } }
      );
    }

    if (photographyRemoved) {
      await Photography.updateMany(
        { addons: existingAddon._id },
        { $pull: { addons: existingAddon._id } }
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
          { _id: { $in: removedProductIds }, addons: existingAddon._id },
          { $pull: { addons: existingAddon._id } }
        );
      }

      if (oldCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          { _id: { $in: removedProductIds }, addons: existingAddon._id },
          { $pull: { addons: existingAddon._id } }
        );
      }
    }

    if (addedProductIds.length > 0) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          { _id: { $in: addedProductIds } },
          { $addToSet: { addons: existingAddon._id } }
        );
      }

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          { _id: { $in: addedProductIds } },
          { $addToSet: { addons: existingAddon._id } }
        );
      }
    }

    if (decorationAdded && newEventIds.length > 0) {
      const query =
        newProductIds.length > 0
          ? { tag: { $in: newEventIds }, _id: { $in: newProductIds } }
          : { tag: { $in: newEventIds } };

      await Decoration.updateMany(query, {
        $addToSet: { addons: existingAddon._id },
      });
    }

    if (photographyAdded && newEventIds.length > 0) {
      const query =
        newProductIds.length > 0
          ? { tag: { $in: newEventIds }, _id: { $in: newProductIds } }
          : { tag: { $in: newEventIds } };

      await Photography.updateMany(query, {
        $addToSet: { addons: existingAddon._id },
      });
    }

    const isNewGenericAddon =
      newEventIds.length === 0 && newProductIds.length === 0;

    if (isNewGenericAddon) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {},
          { $addToSet: { addons: existingAddon._id } }
        );
      }
      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {},
          { $addToSet: { addons: existingAddon._id } }
        );
      }
    }

    const isNewEventLevelAddon =
      newEventIds.length > 0 && newProductIds.length === 0;

    if (isNewEventLevelAddon) {
      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          { tag: { $in: newEventIds } },
          { $addToSet: { addons: existingAddon._id } }
        );
      }

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          { tag: { $in: newEventIds } },
          { $addToSet: { addons: existingAddon._id } }
        );
      }
    }

    const updatedAddOn = await AddOn.findByIdAndUpdate(
      id,
      {
        title,
        price,
        image,
        eventId: newEventIds,
        productId: newProductIds,
        categoryType: newCategoryTypes,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "AddOn updated successfully",
      data: updatedAddOn,
    });
  } catch (error) {
    console.error("Edit AddOn Error:", error);
    next(error);
  }
});

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

    const hasCategories =
      Array.isArray(categoryType) && categoryType.length > 0;

    if (!hasProducts && !hasEvents && !hasCategories) {
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

      productId: Array.isArray(productId)
        ? productId
        : [],

      categoryType: Array.isArray(categoryType)
        ? categoryType
        : [],

      eventId: hasEvents
        ? eventType.map((event) =>
          typeof event === "object"
            ? event.id || event._id
            : event
        )
        : [],
    });

    const savedAddOn = await newAddOn.save();

    // =====================================================
    // 1. PRODUCT SELECTED
    // =====================================================
    if (hasProducts) {
      if (categoryType.includes("Photography")) {
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
      }

      if (categoryType.includes("Decoration")) {
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
      const eventObjectIds = eventType.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      if (categoryType.includes("Decoration")) {
        await Decoration.updateMany(
          {
            tag: { $in: eventObjectIds },
          },
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      }

      if (categoryType.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: eventObjectIds },
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
    else if (hasCategories) {
      if (categoryType.includes("Decoration")) {
        await Decoration.updateMany(
          {},
          {
            $addToSet: {
              addons: savedAddOn._id,
            },
          }
        );
      }

      if (categoryType.includes("Photography")) {
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
