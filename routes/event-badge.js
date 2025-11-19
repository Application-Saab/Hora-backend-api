const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const EventBadge = require("../models/event-badge");

//  Common response function
const sendResponse = (res, status, error, message, data = null) =>
  res.status(status).json({ error, status, message, data });

//  Joi Schema Validations

const createBadgeSchema = Joi.object({
  title: Joi.string().trim().min(2).max(100).required(),
  createdBy: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value))
        return helpers.error("any.invalid");
      return value;
    }),
  eventId: Joi.string()
    .optional()
    .allow(null, "")
    .custom((value, helpers) => {
      if (value && !mongoose.Types.ObjectId.isValid(value))
        return helpers.error("any.invalid");
      return value;
    }),
  badgeNote: Joi.string().trim().max(300).optional(),
});

const updateBadgeSchema = Joi.object({
  title: Joi.string().trim().min(2).max(100).optional(),
  badgeNote: Joi.string().trim().max(300).optional(),
});

// Create Badge
router.post("/", async (req, res) => {
  try {
    const { error, value } = createBadgeSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return sendResponse(
        res,
        422,
        true,
        "Validation failed",
        error.details.map((d) => d.message)
      );
    }

    const { title, createdBy, eventId, badgeNote } = value;

    const newBadge = new EventBadge({
      title,
      createdBy,
      eventId,
      badgeNote,
      isDisabled: false,
      reportedUserIds: [],
    });

    const savedBadge = await newBadge.save();
    return sendResponse(
      res,
      201,
      false,
      "Badge created successfully",
      savedBadge
    );
  } catch (err) {
    console.error("Create Badge Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get All Badges
router.get("/", async (req, res) => {
  try {
    const badges = await EventBadge.find({ isDisabled: { $ne: true } }).lean();
    return sendResponse(res, 200, false, "Badges fetched successfully", badges);
  } catch (err) {
    console.error("Get All Badges Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get Badge By EventId

router.get("/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, 400, true, "Invalid event ID");
    }

    const badges = await EventBadge.find({
      eventId,
      isDisabled: { $ne: true },
    }).lean();

    return sendResponse(res, 200, false, "Badges fetched successfully", badges);
  } catch (err) {
    console.error("Get Badges By Event Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Update Badge
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid badge ID");
    }

    const { error, value } = updateBadgeSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return sendResponse(
        res,
        422,
        true,
        "Validation failed",
        error.details.map((d) => d.message)
      );
    }

    const updatedBadge = await EventBadge.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true }
    );

    if (!updatedBadge) return sendResponse(res, 404, true, "Badge not found");

    return sendResponse(
      res,
      200,
      false,
      "Badge updated successfully",
      updatedBadge
    );
  } catch (err) {
    console.error("Update Badge Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Soft Delete Badge (Disable)
router.post("/disable/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid badge ID");
    }

    const badge = await EventBadge.findById(id);
    if (!badge) return sendResponse(res, 404, true, "Badge not found");

    badge.isDisabled = true;
    await badge.save();

    return sendResponse(res, 200, false, "Badge disabled successfully", badge);
  } catch (err) {
    console.error("Disable Badge Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Create Report for Badge

router.post("/report/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, reason } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return sendResponse(res, 400, true, "Invalid badge or user ID");
    }

    if (!reason || reason.trim().length === 0)
      return sendResponse(res, 400, true, "Reason is required");

    const badge = await EventBadge.findById(id);
    if (!badge) return sendResponse(res, 404, true, "Badge not found");

    // Add report object to array
    badge.reportedUserIds.push({
      userId,
      reason,
      reportedAt: new Date(),
    });

    await badge.save();

    return sendResponse(res, 200, false, "Badge reported successfully", badge);
  } catch (err) {
    console.error("Report Badge Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

// Get All Reports for a Badge
router.get("/badges/reports/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse(res, 400, true, "Invalid badge ID");
    }

    const badge = await EventBadge.findById(id).lean();
    if (!badge) return sendResponse(res, 404, true, "Badge not found");

    const reports = badge.reportedUserIds || [];
    return sendResponse(
      res,
      200,
      false,
      "Badge reports fetched successfully",
      reports
    );
  } catch (err) {
    console.error("Get Badge Reports Error:", err);
    return sendResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
