const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const VenueSuggestions = require("../models/venue-suggestion");
const { CustomResponse } = require("../store/commonFunction");

const VALID_DATA_TYPES = ["FAQ", "SPECIAL_FEATURES"];

// 1. CREATE SUGGESTION
router.post("/", async (req, res, next) => {
  try {
    const { title, metaData, dataType, status } = req.body;

    if (!title || !title.trim()) {
      return CustomResponse(res, 400, true, "Title is required");
    }

    if (dataType && !VALID_DATA_TYPES.includes(dataType.toUpperCase())) {
      return CustomResponse(
        res,
        400,
        true,
        `Invalid dataType. Allowed values: ${VALID_DATA_TYPES.join(", ")}`,
      );
    }

    const newSuggestion = await VenueSuggestions.create({
      title: title.trim(),
      metaData: metaData || {},
      dataType: dataType ? dataType.toUpperCase() : "FAQ",
      status: status !== undefined ? Number(status) : 1,
    });

    return CustomResponse(
      res,
      201,
      false,
      "Suggestion created successfully!",
      newSuggestion,
    );
  } catch (err) {
    next(err);
  }
});

// 2. ADMIN LISTING WITH PAGINATION, SEARCH & FILTERS
router.get("/list", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      dataType = "",
      status = "",
    } = req.query;

    const query = {};

    // By default exclude soft-deleted records unless explicitly asked
    if (status) {
      query.status = Number(status);
    } else {
      query.status = { $ne: 3 };
    }

    // Filter by dataType
    if (dataType) {
      query.dataType = dataType.toUpperCase();
    }

    // Search by title
    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: "i" };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const [suggestions, total] = await Promise.all([
      VenueSuggestions.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      VenueSuggestions.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Suggestions fetched successfully",
      data: suggestions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    err.isPublic = true;
    next(err);
  }
});

// 3. GET SUGGESTIONS BY TYPE (PUBLIC / ACTIVE ONLY)
router.get("/suggestion-by-type/:type", async (req, res, next) => {
  try {
    const rawType = req.params.type?.trim().toUpperCase();

    if (!VALID_DATA_TYPES.includes(rawType)) {
      return CustomResponse(
        res,
        400,
        true,
        `Invalid type param. Allowed values: ${VALID_DATA_TYPES.join(", ")}`,
      );
    }

    const suggestions = await VenueSuggestions.find({
      dataType: rawType,
      status: 1, // only active
    })
      .sort({ createdAt: -1 })
      .lean();

    return CustomResponse(
      res,
      200,
      false,
      "Suggestions fetched successfully!",
      suggestions,
    );
  } catch (err) {
    next(err);
  }
});

// 4. GET SINGLE SUGGESTION BY ID
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return CustomResponse(res, 400, true, "Invalid suggestion id");
    }

    const suggestion = await VenueSuggestions.findOne({
      _id: id,
      status: { $ne: 3 },
    }).lean();

    if (!suggestion) {
      return CustomResponse(res, 404, true, "Suggestion not found");
    }

    return CustomResponse(
      res,
      200,
      false,
      "Suggestion details fetched successfully!",
      suggestion,
    );
  } catch (err) {
    next(err);
  }
});

// 5. UPDATE SUGGESTION (TITLE / METADATA / DATATYPE)
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, metaData, dataType } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return CustomResponse(res, 400, true, "Invalid suggestion id");
    }

    const updateFields = {};
    if (title !== undefined) updateFields.title = title.trim();
    if (metaData !== undefined) updateFields.metaData = metaData;
    if (dataType !== undefined) {
      const formattedType = dataType.toUpperCase();
      if (!VALID_DATA_TYPES.includes(formattedType)) {
        return CustomResponse(
          res,
          400,
          true,
          `Invalid dataType. Allowed: ${VALID_DATA_TYPES.join(", ")}`,
        );
      }
      updateFields.dataType = formattedType;
    }

    const updatedDoc = await VenueSuggestions.findOneAndUpdate(
      { _id: id, status: { $ne: 3 } },
      { $set: updateFields },
      { new: true },
    );

    if (!updatedDoc) {
      return CustomResponse(res, 404, true, "Suggestion not found");
    }

    return CustomResponse(
      res,
      200,
      false,
      "Suggestion updated successfully!",
      updatedDoc,
    );
  } catch (err) {
    next(err);
  }
});

// 6. TOGGLE STATUS (ACTIVE / INACTIVE: 1 OR 2)
router.patch("/status/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return CustomResponse(res, 400, true, "Invalid suggestion id");
    }

    const nextStatus = Number(status);
    if (![1, 2].includes(nextStatus)) {
      return CustomResponse(
        res,
        400,
        true,
        "Status must be 1 for active or 2 for inactive",
      );
    }

    const updatedDoc = await VenueSuggestions.findOneAndUpdate(
      { _id: id, status: { $ne: 3 } },
      { $set: { status: nextStatus } },
      { new: true },
    );

    if (!updatedDoc) {
      return CustomResponse(res, 404, true, "Suggestion not found");
    }

    const statusLabel = nextStatus === 1 ? "Active" : "Inactive";
    return CustomResponse(
      res,
      200,
      false,
      `Suggestion status updated to ${statusLabel}!`,
      updatedDoc,
    );
  } catch (err) {
    next(err);
  }
});

// 7. SOFT DELETE SUGGESTION (STATUS: 3)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return CustomResponse(res, 400, true, "Invalid suggestion id");
    }

    const deletedDoc = await VenueSuggestions.findOneAndUpdate(
      { _id: id, status: { $ne: 3 } },
      { $set: { status: 3 } },
      { new: true },
    );

    if (!deletedDoc) {
      return CustomResponse(
        res,
        404,
        true,
        "Suggestion not found or already deleted",
      );
    }

    return CustomResponse(res, 200, false, "Suggestion deleted successfully!");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
