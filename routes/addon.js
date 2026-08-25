const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AddOn = require('../models/addon');
const Decoration = require('../models/decoration');
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
      productId,
      categoryType,
    } = req.body;

    // =====================================================
    // VALIDATE ADDON ID
    // =====================================================

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: true,
        message: "Invalid AddOn ID",
      });
    }

    // =====================================================
    // FIND EXISTING ADDON
    // =====================================================

    const existingAddon = await AddOn.findById(id);

    if (!existingAddon) {
      return res.status(404).json({
        error: true,
        message: "AddOn not found",
      });
    }

    // =====================================================
    // OLD VALUES
    // =====================================================

    const oldEventIds = Array.isArray(existingAddon.eventId)
      ? existingAddon.eventId.map((id) => id.toString())
      : [];

    const oldProductIds = Array.isArray(existingAddon.productId)
      ? existingAddon.productId.map((id) => id.toString())
      : [];

    const oldCategoryTypes = Array.isArray(
      existingAddon.categoryType
    )
      ? existingAddon.categoryType
      : [];

    // =====================================================
    // NEW VALUES
    // =====================================================

    const newEventIds = Array.isArray(eventId)
      ? eventId.map((id) => id.toString())
      : [];

    const newProductIds = Array.isArray(productId)
      ? productId.map((id) => id.toString())
      : [];

    const newCategoryTypes = Array.isArray(categoryType)
      ? categoryType
      : [];

    // =====================================================
    // ADDON TYPE
    // =====================================================

    const isOldGenericAddon =
      oldEventIds.length === 0 &&
      oldProductIds.length === 0;

    // =====================================================
    // GENERIC ADDON
    //
    // Old:
    // eventId []
    // productId []
    //
    // Generic means it was attached to ALL events/products.
    // So for comparison, old events = all events.
    // =====================================================

    let effectiveOldEventIds = oldEventIds;

    if (isOldGenericAddon) {
      const allEvents = await Meal.find({}, "_id").lean();

      effectiveOldEventIds = allEvents.map((event) =>
        event._id.toString()
      );
    }

    // =====================================================
    // EVENT CHANGES
    // =====================================================

    const removedEventIds = effectiveOldEventIds.filter(
      (oldId) => !newEventIds.includes(oldId)
    );

    const addedEventIds = newEventIds.filter(
      (newId) => !effectiveOldEventIds.includes(newId)
    );

    // =====================================================
    // CATEGORY REMOVED
    // =====================================================

    const decorationRemoved =
      oldCategoryTypes.includes("Decoration") &&
      !newCategoryTypes.includes("Decoration");

    const photographyRemoved =
      oldCategoryTypes.includes("Photography") &&
      !newCategoryTypes.includes("Photography");

    // =====================================================
    // CATEGORY ADDED
    // =====================================================

    const decorationAdded =
      !oldCategoryTypes.includes("Decoration") &&
      newCategoryTypes.includes("Decoration");

    const photographyAdded =
      !oldCategoryTypes.includes("Photography") &&
      newCategoryTypes.includes("Photography");

    // =====================================================
    // 1. REMOVE ADDON FROM REMOVED EVENTS
    // =====================================================

    if (removedEventIds.length > 0) {
      // ---------------------------------------------------
      // PHOTOGRAPHY
      // ---------------------------------------------------

      if (oldCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: removedEventIds },
            addons: existingAddon._id,
          },
          {
            $pull: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // DECORATION
      // ---------------------------------------------------

      if (oldCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            tag: { $in: removedEventIds },
            addons: existingAddon._id,
          },
          {
            $pull: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 2. ADD ADDON TO NEW EVENTS
    // =====================================================

    if (addedEventIds.length > 0) {
      // ---------------------------------------------------
      // PHOTOGRAPHY
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: addedEventIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // DECORATION
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            tag: { $in: addedEventIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 3. CATEGORY REMOVED COMPLETELY
    //
    // Example:
    //
    // old:
    // categoryType ["Decoration"]
    //
    // new:
    // categoryType ["Photography"]
    //
    // => Remove addon from ALL Decoration products
    // =====================================================

    if (decorationRemoved) {
      await Decoration.updateMany(
        {
          addons: existingAddon._id,
        },
        {
          $pull: {
            addons: existingAddon._id,
          },
        }
      );
    }

    if (photographyRemoved) {
      await Photography.updateMany(
        {
          addons: existingAddon._id,
        },
        {
          $pull: {
            addons: existingAddon._id,
          },
        }
      );
    }

    // =====================================================
    // 4. PRODUCT CHANGES
    // =====================================================

    const removedProductIds = oldProductIds.filter(
      (oldId) => !newProductIds.includes(oldId)
    );

    const addedProductIds = newProductIds.filter(
      (newId) => !oldProductIds.includes(newId)
    );

    // =====================================================
    // 5. REMOVE ADDON FROM UNCHECKED PRODUCTS
    // =====================================================

    if (removedProductIds.length > 0) {
      // ---------------------------------------------------
      // PHOTOGRAPHY
      // ---------------------------------------------------

      if (oldCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            _id: { $in: removedProductIds },
            addons: existingAddon._id,
          },
          {
            $pull: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // DECORATION
      // ---------------------------------------------------

      if (oldCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            _id: { $in: removedProductIds },
            addons: existingAddon._id,
          },
          {
            $pull: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 6. ADD ADDON TO NEWLY CHECKED PRODUCTS
    // =====================================================

    if (addedProductIds.length > 0) {
      // ---------------------------------------------------
      // PHOTOGRAPHY
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            _id: { $in: addedProductIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // DECORATION
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            _id: { $in: addedProductIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 7. CATEGORY WAS ADDED
    //
    // Example:
    //
    // Old category:
    // ["Photography"]
    //
    // New category:
    // ["Photography", "Decoration"]
    //
    // If events are selected, attach addon to Decoration
    // products/events also.
    // =====================================================

    if (decorationAdded && newEventIds.length > 0) {
      await Decoration.updateMany(
        {
          tag: { $in: newEventIds },
        },
        {
          $addToSet: {
            addons: existingAddon._id,
          },
        }
      );
    }

    if (photographyAdded && newEventIds.length > 0) {
      await Photography.updateMany(
        {
          tag: { $in: newEventIds },
        },
        {
          $addToSet: {
            addons: existingAddon._id,
          },
        }
      );
    }

    // =====================================================
    // 8. GENERIC ADDON HANDLING
    //
    // If NEW addon is also generic:
    //
    // eventId []
    // productId []
    //
    // Then addon should effectively be available everywhere.
    //
    // Attach addon to ALL products in selected categories.
    // =====================================================

    const isNewGenericAddon =
      newEventIds.length === 0 &&
      newProductIds.length === 0;

    if (isNewGenericAddon) {
      // ---------------------------------------------------
      // ALL PHOTOGRAPHY PRODUCTS
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {},
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // ALL DECORATION PRODUCTS
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {},
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 9. EVENT LEVEL ADDON
    //
    // eventId exists
    // productId []
    //
    // => ALL PRODUCTS OF SELECTED EVENTS
    // =====================================================

    const isNewEventLevelAddon =
      newEventIds.length > 0 &&
      newProductIds.length === 0;

    if (isNewEventLevelAddon) {
      // ---------------------------------------------------
      // PHOTOGRAPHY
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Photography")) {
        await Photography.updateMany(
          {
            tag: { $in: newEventIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }

      // ---------------------------------------------------
      // DECORATION
      // ---------------------------------------------------

      if (newCategoryTypes.includes("Decoration")) {
        await Decoration.updateMany(
          {
            tag: { $in: newEventIds },
          },
          {
            $addToSet: {
              addons: existingAddon._id,
            },
          }
        );
      }
    }

    // =====================================================
    // 10. UPDATE ADDON DOCUMENT
    // =====================================================

    const updatedAddOn =
      await AddOn.findByIdAndUpdate(
        id,
        {
          title,
          price,
          image,
          eventId: newEventIds,
          productId: newProductIds,
          categoryType: newCategoryTypes,
        },
        {
          new: true,
        }
      );

    // =====================================================
    // RESPONSE
    // =====================================================

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
            ? event.id
            : event
        )
        : [],
    });

    const savedAddOn = await newAddOn.save();

    // =====================================================
    // 1. PRODUCT SELECTED
    // =====================================================
    if (hasProducts) {
      // Photography products
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

      // Decoration products
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
      // ---------------- ALL DECORATION ----------------
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

      // ---------------- ALL PHOTOGRAPHY ----------------
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
