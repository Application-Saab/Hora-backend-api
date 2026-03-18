const express = require("express");
const router = express.Router();
const CelebrationBooster = require("../models/celebration-booster");
const { CustomResponse } = require("../store/commonFunction");

router.post("/createCelebrationBooster", async (req, res) => {
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
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.get("/celebrationBoostersList", async (req, res) => {
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
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.put("/updateCelebrationBooster/:id", async (req, res) => {
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
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.post("/adminCelebrationBoosterList", async (req, res) => {
  try {
    const { page, per_page, name, status, type, tag } = req.body;

    let query = {};

    if (name) {
      query.name = { $regex: name, $options: "i" };
    }

    if (status !== undefined && status !== "") {
      query.status = parseInt(status);
    }

    if (type) {
      query.type = type;
    }

    if (tag) {
      query.tag = tag;
    }

    const currentPage = page ? parseInt(page) : 1;
    const limit = per_page ? parseInt(per_page) : 10;
    const skip = (currentPage - 1) * limit;

    const boosters = await CelebrationBooster.find(query)
      .populate("tag")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CelebrationBooster.countDocuments(query);

    const paginate = {
      total_item: total,
      showing: boosters.length,
      first_page: 1,
      previous_page: currentPage > 1 ? currentPage - 1 : 1,
      current_page: currentPage,
      next_page:
        currentPage < Math.ceil(total / limit)
          ? currentPage + 1
          : Math.ceil(total / limit),
      last_page: Math.ceil(total / limit),
    };

    return CustomResponse(res, 200, false, "Boosters fetched successfully", {
      boosters,
      paginate,
    });
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

router.post("/getCelebrationBoosterByName", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return CustomResponse(res, 400, true, "Name is required");
    }

    const booster = await CelebrationBooster.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    }).populate("tag");

    if (!booster) {
      return CustomResponse(res, 404, true, "Design not found");
    }

    return CustomResponse(
      res,
      200,
      false,
      "Design fetched successfully",
      booster,
    );
  } catch (error) {
    console.error(error);
    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
