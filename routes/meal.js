const express = require("express");
const mealModel = require("../models/meal");
const router = express.Router();
const NodeCache = require("node-cache");

const mealCache = new NodeCache({ stdTTL: 300 });

//...... working apis ......
//used in the web
router.get("/idByTag", async (req, res, next) => {
  try {
    const tag = req.query?.tag;

    if (!tag) {
      return res.status(400).json({
        error: true,
        message: "tag is required",
      });
    }
    const cacheKey = `meal:${tag.toLowerCase()}`;
    //  Check cache first
    const cachedData = mealCache.get(cacheKey);
    if (cachedData) {
      return res.json({
        error: false,
        status: 200,
        message: "From Cache",
        data: cachedData,
      });
    }

    // DB hit
    const data = await mealModel
      .findOne({
        name: tag,
        // status: 1,
      })
      .select("_id name configurationId status")
      .lean();

    //  Save to cache
    if (data) {
      mealCache.set(cacheKey, data);
    }

    return res.json({
      error: false,
      status: 200,
      message: "Details Fetch Successfully",
      data,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.post("/admin_meals_list", async (req, res, next) => {
  try {
    // Build filter
    let finder = {
      status: { $ne: 2 },
    };

    const type = req.body?.type;
    if (type) {
      finder.type = Number(type);
    }

    // Pagination defaults
    const page = Number(req.body?.page) || 1;
    const perPage = Number(req.body?.per_page) || 20;

    // Search by name
    if (req.body?.name) {
      finder.name = new RegExp(req.body.name.trim(), "i");
    }

    // Query
    const meal = await mealModel.aggregate([
      { $match: finder },
      {
        $lookup: {
          from: "configurations",
          localField: "configurationId",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, _id: 0 } }],
          as: "configurationId",
        },
      },
      { $sort: { name: 1 } },
      { $match: { _id: { $nin: [] } } },
      { $skip: (page - 1) * perPage },
      { $limit: perPage },
    ]);

    const totalmeal = await mealModel.countDocuments(finder);

    const paginate = {
      total_item: totalmeal,
      showing: meal.length,
      first_page: 1,
      previous_page: perPage,
      current_page: page,
      next_page: page + 1,
      last_page: Math.ceil(totalmeal / perPage),
    };

    if (meal.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Fetch Data Successfully",
        data: { meal, paginate },
      });
    } else {
      return res.json({
        error: true,
        status: 503,
        message: "No Record Found",
      });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
}); //post done

// ....... not used ......
router.post("/add", async (req, res, next) => {
  const data = new mealModel({
    name: req.body.name,
    configurationId: req.body.configurationId,
    image: req.body.image,
  });
  try {
    const meal = await mealModel.find({
      name: data.name,
      configurationId: data.configurationId,
    });
    if (meal.length > 0) {
      return res.json({ error: true, status: 503, message: "Already Added" });
    } else {
      const dataToSave = await data.save();
      return res.json({
        error: false,
        status: 200,
        message: "Added Successfully",
        data: dataToSave,
      });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.post("/edit", async (req, res, next) => {
  const id = req.body._id;
  const updatedData = req.body;
  const options = { new: true };
  try {
    const result = await mealModel.findByIdAndUpdate(id, updatedData, options);
    return res.json({
      error: false,
      status: 200,
      message: "Updated Successfully",
      data: result,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/details/:id", async (req, res, next) => {
  try {
    const data = await mealModel.findById(req.params.id);
    return res.json({
      error: false,
      status: 200,
      message: "Details Fetch Successfully",
      data: data,
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

// router.get('/idByTag', async (req, res) => {
//     const tag = req.query?.tag;  // modern optional chaining

//     try {
//         const data = await mealModel.findOne({ name: tag });

//         return res.json({
//             error: false,
//             status: 200,
//             message: 'Details Fetch Successfully',
//             data: data
//         });

//     } catch (error) {
//         return res.status(400).json({
//             message: error.message,
//             error: true
//         });
//     }
// });

router.post("/update_meals_status", async (req, res, next) => {
  const { _id } = req.body;
  if (!_id) {
    return res.json({
      error: true,
      status: 422,
      data: [{ path: "_id", message: "Id is required." }],
    });
  }
  try {
    const meal = await mealModel.find({ _id: req.body._id });
    if (meal.length > 0) {
      const update = {
        status: req.body.status,
      };
      const result = await mealModel.findByIdAndUpdate(meal[0]._id, {
        $set: update,
      });
      return res.json({
        error: false,
        status: 200,
        message: "Status Update Successfully",
      });
    } else {
      return res.json({
        error: true,
        status: 503,
        message: "Details Not Found",
      });
    }
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});


module.exports = router;
