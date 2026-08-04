const express = require("express");
const router = express.Router();
const CelebrationBooster = require("../models/celebration-booster");
const { CustomResponse } = require("../store/commonFunction");
const getPaginatedData = require("../utils/functions");

router.post("/createCelebrationBooster", async (req, res, next) => {
  try {
    const data = req.body;

    const booster = new CelebrationBooster(data);

    await booster.save();

    return CustomResponse(
      res,
      201,
      false,
      "Celebration booster created successfully",
      booster,
    );
  } catch (error) {
      next(error);
  }
});

router.get("/celebrationBoostersList", async (req, res, next) => {
  try {
    const boosters = await CelebrationBooster.find({
      status: 1,
    })
      .populate("tag")
      .sort({ createdAt: -1 });

    return CustomResponse(
      res,
      200,
      false,
      "Boosters fetched successfully",
      boosters,
    );
  } catch (error) {
    next(error);
  }
});

router.put("/updateCelebrationBooster/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const updated = await CelebrationBooster.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updated) {
      return CustomResponse(res, 404, true, "Booster not found");
    }

    return CustomResponse(
      res,
      200,
      false,
      "Booster updated successfully",
      updated,
    );
  } catch (error) {
    next(error);
  }
});

router.post("/adminCelebrationBoosterList", async (req, res, next) => {
  try {
    const { page, per_page, name, status, type, tag } = req.body;

    let query = {};
    if (name) query.name = { $regex: name, $options: "i" };
    if (status !== undefined && status !== "") query.status = parseInt(status);
    if (type) query.type = type;
    if (tag) query.tag = tag;

    const { items, paginate } = await getPaginatedData({
      model: CelebrationBooster,
      query: query,
      page: page,
      per_page: per_page,
      populate: "tag",
    });

    return CustomResponse(res, 200, false, "Boosters fetched successfully", {
      boosters: items,
      paginate,
    });
  } catch (error) {
    next(error);
  }
});

// Path parameters use kar rahe hain hum yahan (:name)
router.get("/getCelebrationBoosterByName/:name", async (req, res, next) => {
  try {
    // GET request me data req.params se nikalte hain
    const { name } = req.params;

    if (!name) {
      return CustomResponse(res, 400, true, "Name is required");
    }

    const booster = await CelebrationBooster.findOne({
      // Regex case-insensitive search ke liye (Sahi hai tera logic)
      name: { $regex: `^${name}$`, $options: "i" },
    }).populate("tag");

    if (!booster) {
      return CustomResponse(res, 200, true, "Design not found", {});
    }

    return CustomResponse(
      res,
      200,
      false,
      "Design fetched successfully",
      booster,
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
