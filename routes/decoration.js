const express = require("express");
const orderModel = require("../models/order");
const router = express.Router();
const AddressModel = require("../models/address");
const decorationModel = require("../models/decoration");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 60 * 10 }); // Cache TTL: 10 minutes
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

router.post("/add", async (req, res) => {
  const {
    name,
    short_link,
    featured_image,
    caption,
    featured_images,
    badge,
    price,
    cost_price,
    type,
    is_wishlisted,
    ratings,
    attributes,
    inclusion,
    tag,
  } = req.body;

  const data = new decorationModel({
    name: name,
    short_link: short_link,
    featured_image: featured_image,
    caption: caption,
    featured_images: featured_images,
    badge: badge,
    price: price,
    cost_price: cost_price,
    type: type,
    is_wishlisted: is_wishlisted,
    ratings: ratings,
    attributes: attributes,
    inclusion: inclusion,
    tag: tag,
  });

  try {
    // Check if a decoration with the same name and type already exists
    const existingDecoration = await decorationModel.findOne({
      name: data.name,
      type: data.type,
    });

    if (existingDecoration) {
      return res.json({
        error: true,
        status: 503,
        message: "Decoration already added.",
      });
    } else {
      const savedData = await data.save();
      return res.json({
        error: false,
        status: 200,
        message: "Decoration added successfully.",
        data: savedData,
      });
    }
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
});

router.post("/edit", async (req, res) => {
  const id = req.body._id;
  const updatedData = req.body;
  const options = { new: true };

  try {
    const result = await decorationModel.findByIdAndUpdate(
      id,
      updatedData,
      options,
    );

    if (result) {
      // ----- NEW CACHE UPDATE -----
      if (updatedData.tag && updatedData.tag.length > 0) {
        const firstTag = updatedData.tag[0];
        // fetch all decorations with this tag
        const decorationsForTag = await decorationModel
          .find({ tag: { $in: [firstTag] } })
          .lean();
        const cacheResponse = {
          error: false,
          status: 200,
          message: "Search Successful",
          data: decorationsForTag,
        };
        cache.set(`search_tag_${firstTag}`, cacheResponse);
      }
      return res.json({
        error: false,
        status: 200,
        message: "Updated Successfully",
        data: result,
      });
    } else {
      return res.json({
        error: true,
        status: 404,
        message: "Decoration not found.",
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: error.message,
    });
  }
});

router.post("/update_decoration_status", async (req, res) => {
  const { _id, status } = req.body;

  if (!_id) {
    return res.json({
      error: true,
      status: 422,
      data: [{ path: "_id", message: "Id is required." }],
    });
  }

  try {
    const decoration = await decorationModel.findById(_id);

    if (decoration) {
      const update = {
        status: status,
      };

      const result = await decorationModel.findByIdAndUpdate(_id, {
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
        status: 404,
        message: "Decoration Not Found",
      });
    }
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
});

router.get("/searchByName/:name", async (req, res) => {
  const { name } = req.params;

  try {
    const decorations = await decorationModel.find({
      name: { $regex: new RegExp(name, "i") },
    });

    if (decorations.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Search Successful",
        data: decorations,
      });
    } else {
      return res.json({
        error: true,
        status: 404,
        message: "No matching decorations found.",
      });
    }
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: error.message,
    });
  }
});

router.get("/searchByTag/:tag", async (req, res) => {
  const { tag } = req.params;
  const cacheKey = `search_tag_${tag}`;

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    const decorations = await decorationModel
      .find({ tag: { $in: [tag] } })
      .lean();

    if (decorations.length > 0) {
      const response = {
        error: false,
        status: 200,
        message: "Search Successful",
        data: decorations,
      };
      cache.set(cacheKey, response);
      return res.json(response);
    } else {
      const response = {
        error: true,
        status: 404,
        message: "No matching decorations found.",
      };
      cache.set(cacheKey, response);
      return res.json(response);
    }
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: error.message,
    });
  }
});

router.get("/details/:id", async (req, res) => {
  try {
    const data = await decorationModel.findById(req.params.id).populate({
      path: "tag",
    });
    return res.json({
      error: false,
      status: 200,
      message: "Details Fetch Successfully",
      data: data,
    });
  } catch (error) {
    res.status(400).json({ message: error.message, error: true });
  }
});

router.get("/searchByTag/v2/:tag", async (req, res) => {
  try {
    const { tag } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 1000);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const priceFilter = req.query.priceFilter;
    const sortBy = req.query.sortBy?.toLowerCase(); // "asc" or "desc"
    const theme = req.query.theme;

    const cacheKey = `search_${tag}_${limit}_${page}_${priceFilter || "absent"}_${sortBy || "default"}_${theme || "all"}`;

    // Cache hit
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }
    
    // Match stage with dynamic filters
    const matchStage = { status: 1 };

    if (mongoose.Types.ObjectId.isValid(tag)) {
      matchStage.tag = new mongoose.Types.ObjectId(tag);
    } else {
      matchStage.tag = tag;
    }

    // Price Filter
    if (priceFilter === "under2000") {
      matchStage.$expr = { $lt: [{ $toDouble: "$price" }, 2000] };
    } else if (priceFilter === "2000to5000") {
      matchStage.$expr = {
        $and: [
          { $gte: [{ $toDouble: "$price" }, 2000] },
          { $lte: [{ $toDouble: "$price" }, 5000] },
        ],
      };
    } else if (priceFilter === "above5000") {
      matchStage.$expr = { $gt: [{ $toDouble: "$price" }, 5000] };
    }

    // Theme filter
    if (theme && theme !== "all") {
      const formattedTheme = theme.toLowerCase().split("-")[0];
      matchStage.name = { $regex: formattedTheme, $options: "i" };
    }

    // Sorting logic
    const isAsc = sortBy === "asc";
    const isDesc = sortBy === "desc";
    const priceSortDir = isAsc ? 1 : isDesc ? -1 : null;

    let sortStage;

    const priceFilterIsAll = priceFilter === "all" || priceFilter === "All";
    const hasSpecificPriceFilter =
      priceFilter &&
      !priceFilterIsAll &&
      ["under2000", "2000to5000", "above5000"].includes(priceFilter);

    if (priceSortDir !== null) {
      if (priceFilterIsAll || hasSpecificPriceFilter) {
        sortStage = { popularity_score: -1, numericPrice: priceSortDir };
      } else {
        sortStage = { numericPrice: priceSortDir, popularity_score: -1 };
      }
    } else {
      sortStage = { popularity_score: -1 };
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchStage },

      // Safe numericPrice for sorting
      {
        $addFields: {
          numericPrice: {
            $cond: {
              if: { $or: [{ $eq: ["$price", null] }, { $eq: ["$price", ""] }] },
              then: 0,
              else: { $toDouble: "$price" },
            },
          },
        },
      },

      { $sort: sortStage },

      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                name: 1,
                short_link: 1,
                featured_image: 1,
                price: 1,
                cost_price: 1,
                ratings: 1,
                popularity_score: 1,
              },
            },
          ],
          pagination: [{ $count: "totalItems" }],
        },
      },
    ];

    const result = await decorationModel
      .aggregate(pipeline)
      .collation({ locale: "en", numericOrdering: true });

    const decorations = result[0]?.data || [];
    const totalItems = result[0]?.pagination?.[0]?.totalItems || 0;

    const response = {
      error: false,
      status: 200,
      ok: "ok",
      message:
        decorations.length > 0
          ? "Search Successful"
          : "No matching decorations found.",
      data: decorations,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    };

    // Cache save
    cache.set(cacheKey, response);

    return res.json(response);
  } catch (error) {
    console.error("=== SearchByTag v2 Error ===", error);
    return res.status(500).json({
      error: true,
      message: "Server Error: " + error.message,
    });
  }
});

//get decoration by name and all orders individual product actual images
router.get("/decorations/:name/orders", async (req, res) => {
  try {
    const { name } = req.params;

    const decoration = await decorationModel
      .findOne({
        name: { $regex: new RegExp(name, "i") },
      })
      .lean();

    if (!decoration) {
      return res.status(404).json({
        error: true,
        status: 404,
        message: "Decoration not found",
      });
    }

    // Find orders that include this decoration
    const orders = await orderModel
      .find({
        $or: [
          { items: decoration._id },
          { items: decoration._id.toString() },
          { "items.itemId": decoration._id },
          { "items.itemId": decoration._id.toString() },
        ],
        userOrderDishImageArray: { $exists: true, $ne: [] },
      })
      .select("_id order_id order_date userOrderDishImageArray")
      .lean();

    // Normalize images: convert strings to objects, keep objects as-is
    const updatedOrders = orders.map((order) => {
      const images = order.userOrderDishImageArray.map((img) => {
        if (typeof img === "string") {
          return {
            image: img,
            is_tagged: false,
          };
        }
        return {
          ...img,
        };
      });

      return {
        ...order,
        userOrderDishImageArray: images,
      };
    });

    return res.json({
      error: false,
      status: 200,
      message: "Decoration details fetched successfully",
      data: {
        decoration,
        orders: updatedOrders, // will be empty array if no orders exist
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      status: 500,
      message: err.message,
    });
  }
});

// delete images by iamge name
router.post("/delete-image", async (req, res) => {
  try {
    const { imageName } = req.body;
    if (!imageName) {
      return res.status(400).json({ message: "Image name is required" });
    }

    const filePath = path.join(process.cwd(), "uploads", imageName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const r1 = await orderModel.collection.updateMany(
      { userOrderDishImageArray: imageName },
      { $pull: { userOrderDishImageArray: imageName } },
    );

    const r2 = await orderModel.collection.updateMany(
      { "userOrderDishImageArray.image": imageName },
      { $pull: { userOrderDishImageArray: { image: imageName } } },
    );

    return res.json({
      success: true,
      message: "Image deleted from server & database",
      imageName,
      modifiedCount: (r1.modifiedCount || 0) + (r2.modifiedCount || 0),
    });
  } catch (err) {
    console.error("DELETE IMAGE ERROR", err);
    return res.status(500).json({
      message: "Error deleting image",
      error: err.message,
    });
  }
});

module.exports = router;
