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
const AddOn = require("../models/addon")

const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });
const sharp = require("sharp");

const deleteFileIfExists = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("File delete error:", err);
  }
};

const compressImageToWebP = async (buffer, outputPath, targetMaxKB = 40) => {
  let quality = 85;
  const step = 5;

  while (quality > 5) {
    const compressedBuffer = await sharp(buffer).webp({ quality }).toBuffer();

    const sizeKB = compressedBuffer.length / 1024;

    if (sizeKB <= targetMaxKB) {
      fs.writeFileSync(outputPath, compressedBuffer);
      return true;
    }

    quality -= step;
  }

  // Final attempt with lowest quality
  const fallbackBuffer = await sharp(buffer).webp({ quality: 5 }).toBuffer();
  fs.writeFileSync(outputPath, fallbackBuffer);
  return false;
};



const normalizeInclusion = (inclusion) => {
  if (!inclusion) return [];

  try {
    // Case 1:
    // '["<div>...</div>"]'
    if (typeof inclusion === "string" && inclusion.startsWith("[")) {
      inclusion = JSON.parse(inclusion);
    }

    // Case 2:
    // "<div>...</div>"
    if (typeof inclusion === "string") {
      return [inclusion];
    }

    // Case 3:
    // ["<div>...</div>"]
    if (Array.isArray(inclusion)) {
      return [
        inclusion
          .filter(Boolean)
          .join("")
      ];
    }

    return [];
  } catch (err) {
    console.error("normalizeInclusion error", err);
    return [];
  }
};

router.post("/edit", upload.array("featured_images", 10), async (req, res, next) => {
  try {
    const id = req.body._id;

    const existing = await decorationModel.findById(id);

    if (!existing) {
      return res.status(404).json({
        error: true,
        message: "Decoration not found",
      });
    }

    let existingImages = existing.featured_images || [];

    // -----------------------------
    // REMOVE IMAGES HANDLING
    // -----------------------------
    let removedImages = [];

    if (req.body.removedImages) {
      try {
        removedImages =
          typeof req.body.removedImages === "string"
            ? JSON.parse(req.body.removedImages)
            : req.body.removedImages;
      } catch (e) {
        removedImages = [];
      }

      removedImages.forEach((img) => {
        const filePath = path.join(
          __dirname,
          "../uploads/compressed_webp",
          img.fileName,
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      existingImages = existingImages.filter(
        (img) => !removedImages.some((r) => r.fileName === img.fileName),
      );
    }

    // -----------------------------
    // NEW IMAGES UPLOAD
    // -----------------------------
    let newImages = [];

    if (req.files && req.files.length > 0) {
      const outputFolder = path.resolve(
        __dirname,
        "../uploads/compressed_webp",
      );

      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      newImages = await Promise.all(
        req.files.map(async (file) => {
          const fileName = `${Date.now()}-${path.parse(file.originalname).name}.webp`;
          const outputPath = path.join(outputFolder, fileName);

          await compressImageToWebP(file.buffer, outputPath);

          return {
            fileName,
            url: `/uploads/compressed_webp/${fileName}`, // 👈 as per schema
            createdAt: new Date(),
          };
        }),
      );
    }

    const inclusion = normalizeInclusion(req.body.inclusion);


    const updatedTags = req.body.tag
      ? typeof req.body.tag === "string"
        ? JSON.parse(req.body.tag)
        : req.body.tag
      : [];


    const eventAddonIds = (
      await AddOn.find({
        categoryType: "Decoration",
        eventId: { $in: updatedTags }
      }).distinct("_id")
    ).map(id => id.toString());

    const existingAddonDocs = await AddOn.find({
      _id: { $in: existing.addons || [] }
    }).select("_id eventId productId");

    const productAddonIds = existingAddonDocs
      .filter(
        (addon) =>
          Array.isArray(addon.productId) &&
          addon.productId.length > 0
      )
      .map((addon) => addon._id.toString());

    const genericAddonIds = existingAddonDocs
      .filter(
        (addon) =>
          Array.isArray(addon.eventId) &&
          addon.eventId.length === 0 &&
          Array.isArray(addon.productId) &&
          addon.productId.length === 0
      )
      .map((addon) => addon._id.toString());

    const addonIds = [
      ...new Set([
        ...productAddonIds,
        ...genericAddonIds,
        ...eventAddonIds
      ])
    ];

    // -----------------------------
    // UPDATE DB
    // -----------------------------
    const updated = await decorationModel.findByIdAndUpdate(
      id,
      {
        name: req.body.name,
        price: req.body.price,
        tag: req.body.tag
          ? typeof req.body.tag === "string"
            ? JSON.parse(req.body.tag)
            : req.body.tag
          : [],
        designType:
          req.body.designType === "string"
            ? JSON.parse(req.body.designType)
            : req.body.designType,

        inclusion,
        inclusionVariables:
          req.body.inclusionVariables === "string"
            ? JSON.parse(req.body.inclusionVariables)
            : req.body.inclusionVariables,

        featured_images: [...existingImages, ...newImages],
        addons: addonIds,

      },
      { new: true },
    );

    return res.json({
      error: false,
      message: "Updated successfully",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// router.post('/edit', async (req, res) => {
//     const id = req.body._id;
//     const updatedData = req.body;
//     const options = { new: true };

//     try {
//         const result = await decorationModel.findByIdAndUpdate(id, updatedData, options);

//         if (result) {
//             // ----- NEW CACHE UPDATE -----
//             if (updatedData.tag && updatedData.tag.length > 0) {
//                 const firstTag = updatedData.tag[0];
//                 // fetch all decorations with this tag
//                 const decorationsForTag = await decorationModel.find({ tag: { $in: [firstTag] } }).lean();
//                 const cacheResponse = {
//                     error: false,
//                     status: 200,
//                     message: 'Search Successful',
//                     data: decorationsForTag
//                 };
//                 cache.set(`search_tag_${firstTag}`, cacheResponse);
//             }
//             return res.json({
//                 error: false,
//                 status: 200,
//                 message: 'Updated Successfully',
//                 data: result
//             });
//         } else {
//             return res.json({
//                 error: true,
//                 status: 404,
//                 message: 'Decoration not found.'
//             });
//         }
//     } catch (error) {
//         return res.status(400).json({
//             error: true,
//             message: error.message
//         });
//     }
// });

// router.post('/add', async (req, res) => {
//     const {
//         name,
//         short_link,
//         featured_image,
//         caption,
//         featured_images,
//         badge,
//         price,
//         cost_price,
//         type,
//         is_wishlisted,
//         ratings,
//         attributes,
//         inclusion,
//         tag
//     } = req.body;

//     const data = new decorationModel({
//         name: name,
//         short_link: short_link,
//         featured_image: featured_image,
//         caption: caption,
//         featured_images: featured_images,
//         badge: badge,
//         price: price,
//         cost_price: cost_price,
//         type: type,
//         is_wishlisted: is_wishlisted,
//         ratings: ratings,
//         attributes: attributes,
//         inclusion: inclusion,
//         tag: tag
//     });

//     try {
//         // Check if a decoration with the same name and type already exists
//         const existingDecoration = await decorationModel.findOne({ name: data.name, type: data.type });

//         if (existingDecoration) {
//             return res.json({ error: true, status: 503, message: 'Decoration already added.' });
//         } else {
//             const savedData = await data.save();
//             return res.json({ error: false, status: 200, message: 'Decoration added successfully.', data: savedData });
//         }
//     } catch (error) {
//         res.status(400).json({ error: true, message: error.message });
//     }
// });

router.post("/add", upload.single("featured_image"), async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: true, message: "Image required" });
    }

    // folder create
    const outputFolder = "../uploads/compressed_webp";
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const originalName = path.parse(file.originalname).name;
    const fileName = `${originalName}-${Date.now()}.webp`;
    const outputPath = path.join(outputFolder, fileName);

    // compress + save
    await compressImageToWebP(file.buffer, outputPath);

    const {
      name,
      short_link,
      caption,
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

    const existingDecoration = await decorationModel.findOne({
      name,
      type,
    });

    if (existingDecoration) {
      return res.json({
        error: true,
        status: 503,
        message: "Decoration already added.",
      });
    }

    const data = new decorationModel({
      name,
      short_link,
      featured_image: fileName, // 👈 now from upload
      caption,
      badge,
      price,
      cost_price,
      type,
      is_wishlisted,
      ratings,
      attributes,
      inclusion,
      tag,
    });

    const savedData = await data.save();

    return res.json({
      error: false,
      status: 200,
      message: "Decoration added successfully",
      data: savedData,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/update_decoration_status", async (req, res, next) => {
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
    next(error);
  }
});

router.get("/searchByName/:name", async (req, res, next) => {
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
    error.isPublic = true;
    next(error);
  }
});

router.get("/searchByTag/:tag", async (req, res, next) => {
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
    error.isPublic = true;
    next(error);
  }
});

router.post("/searchByTags", async (req, res, next) => {
  try {
    const { tags } = req.body;

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        error: true,
        status: 400,
        message: "tags must be a non-empty array",
      });
    }

    const cacheKey = `search_tags_${tags.sort().join("_")}`;

    const cached = cache.get(cacheKey);

    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const decorations = await decorationModel
      .find({
        tag: {
          $in: tags,
        },
      })
      .lean();

    const response = {
      error: false,
      status: 200,
      message: "Search Successful",
      data: decorations,
    };

    cache.set(cacheKey, response);

    return res.json(response);

  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/details/:id", async (req, res, next) => {
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
    error.isPublic = true;
    next(error);
  }
});

router.get("/searchByTag/v2/:tag", async (req, res, next) => {
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
                featured_images: 1,
                price: 1,
                cost_price: 1,
                ratings: 1,
                popularity_score: 1,
                designType: 1,
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
    error.isPublic = true;
    next(error);
  }
});

// get decoration by name and all orders individual product actual images

// ====================== Optimized Search API ======================

// router.get("/searchByTag/v2/:tag", async (req, res) => {
//   try {
//     const { tag } = req.params;
//     const limit = Math.min(parseInt(req.query.limit) || 10, 1000);
//     const page = Math.max(parseInt(req.query.page) || 1, 1);

//     const priceFilter = req.query.priceFilter?.toLowerCase();
//     const sortBy = req.query.sortBy?.toLowerCase();
//     const theme = req.query.theme?.toLowerCase();

//     const cacheKey = `search_v3_${tag}_${limit}_${page}_${priceFilter || "all"}_${sortBy || "def"}_${theme || "all"}`;

//     if (cache.has(cacheKey)) {
//       return res.json({ ...cache.get(cacheKey), cached: true });
//     }

//     const matchStage = { status: 1 };

//     // Tag
//     if (mongoose.Types.ObjectId.isValid(tag)) {
//       matchStage.tag = new mongoose.Types.ObjectId(tag);
//     } else {
//       matchStage.tag = tag;
//     }

//     // Theme Filter
//     if (theme && theme !== "all") {
//       matchStage.name = { $regex: theme.split("-")[0], $options: "i" };
//     }

//     // Price Filter - Try to avoid $expr as much as possible
//     let pricePipeline = [];
//     if (priceFilter) {
//       if (priceFilter === "under2000") {
//         pricePipeline = [
//           { $match: { $expr: { $lt: [{ $toDouble: "$price" }, 2000] } } },
//         ];
//       } else if (priceFilter === "2000to5000") {
//         pricePipeline = [
//           {
//             $match: {
//               $expr: {
//                 $and: [
//                   { $gte: [{ $toDouble: "$price" }, 2000] },
//                   { $lte: [{ $toDouble: "$price" }, 5000] },
//                 ],
//               },
//             },
//           },
//         ];
//       } else if (priceFilter === "above5000") {
//         pricePipeline = [
//           { $match: { $expr: { $gt: [{ $toDouble: "$price" }, 5000] } } },
//         ];
//       }
//     }

//     // Sorting
//     let sortStage = { popularity_score: -1 };
//     if (sortBy === "asc" || sortBy === "desc") {
//       const dir = sortBy === "asc" ? 1 : -1;
//       sortStage = { numericPrice: dir, popularity_score: -1 };
//     }

//     const pipeline = [
//       { $match: matchStage },

//       // Add numeric price once
//       {
//         $addFields: {
//           numericPrice: {
//             $cond: [
//               { $or: [{ $eq: ["$price", null] }, { $eq: ["$price", ""] }] },
//               0,
//               { $toDouble: "$price" },
//             ],
//           },
//         },
//       },

//       ...pricePipeline, // Price filter after numericPrice

//       { $sort: sortStage },

//       {
//         $facet: {
//           data: [
//             { $skip: (page - 1) * limit },
//             { $limit: limit },
//             {
//               $project: {
//                 _id: 1,
//                 name: 1,
//                 short_link: 1,
//                 featured_image: 1,
//                 featured_images: 1,
//                 price: 1,
//                 cost_price: 1,
//                 ratings: 1,
//                 popularity_score: 1,
//                 designType: 1,
//               },
//             },
//           ],
//           pagination: [{ $count: "totalItems" }],
//         },
//       },
//     ];

//     const result = await decorationModel.aggregate(pipeline, {
//       allowDiskUse: true, // Important for large datasets
//       collation: { locale: "en", numericOrdering: true },
//     });

//     const decorations = result[0]?.data || [];
//     const totalItems = result[0]?.pagination?.[0]?.totalItems || 0;

//     const response = {
//       error: false,
//       status: 200,
//       ok: "ok",
//       message: decorations.length
//         ? "Search Successful"
//         : "No matching decorations found.",
//       data: decorations,
//       pagination: {
//         totalItems,
//         totalPages: Math.ceil(totalItems / limit),
//         currentPage: page,
//         limit,
//       },
//     };

//     cache.set(cacheKey, response);
//     return res.json(response);
//   } catch (error) {
//     console.error("SearchByTag v2 Error:", error);
//     return res.status(500).json({ error: true, message: error.message });
//   }
// });

router.get("/searchByTag/v3/:tag", async (req, res, next) => {
  try {
    const { tag } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 1000);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const theme = req.query.theme;
    const search = req.query.search?.trim();

    // ---- Sort (mirrors SearchSortBar sortOptions) ----
    // popularity | newArrival | lowToHigh | highToLow
    const sortBy = (req.query.sortBy || "popularity").toLowerCase();

    // ---- Price range (mirrors ThemeSelector priceRange buckets) ----
    // Frontend sends numeric minPrice/maxPrice directly.
    // For open-ended "stage" bucket (12001-Infinity), simply omit maxPrice.
    const minPrice =
      req.query.minPrice !== undefined ? Number(req.query.minPrice) : null;
    const maxPrice =
      req.query.maxPrice !== undefined && req.query.maxPrice !== "" && req.query.maxPrice !== "Infinity"
        ? Number(req.query.maxPrice)
        : null;

    const cacheKey = `search_${tag}_${limit}_${page}_${minPrice ?? "noMin"}_${maxPrice ?? "noMax"}_${sortBy}_${theme || "all"}_${search || "noSearch"}`;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }

    const matchStage = { status: 1 };

    if (mongoose.Types.ObjectId.isValid(tag)) {
      matchStage.tag = new mongoose.Types.ObjectId(tag);
    } else {
      matchStage.tag = tag;
    }

    // Safe string->double conversion for price (won't throw on "", null, garbage strings)
    const priceExpr = {
      $convert: { input: "$price", to: "double", onError: 0, onNull: 0 },
    };

    if (minPrice !== null || maxPrice !== null) {
      const conditions = [];
      if (minPrice !== null && !isNaN(minPrice)) {
        conditions.push({ $gte: [priceExpr, minPrice] });
      }
      if (maxPrice !== null && !isNaN(maxPrice)) {
        conditions.push({ $lte: [priceExpr, maxPrice] });
      }
      if (conditions.length) {
        matchStage.$expr = conditions.length > 1 ? { $and: conditions } : conditions[0];
      }
    }

    // Theme filter (kids-birthday / naming-ceremony tabs) — unchanged
    if (theme && theme !== "all") {
      const formattedTheme = theme.toLowerCase().split("-")[0];
      matchStage.name = { $regex: formattedTheme, $options: "i" };
    }

    // "Matching Products" search box — name based
    if (search) {
      const searchCond = { name: { $regex: search, $options: "i" } };
      if (matchStage.name) {
        // both theme + search active → AND them
        matchStage.$and = [{ name: matchStage.name }, searchCond];
        delete matchStage.name;
      } else {
        matchStage.name = searchCond.name;
      }
    }

    // ---- Sort stage ----
    let sortStage;
    switch (sortBy) {
      case "newarrival":
        sortStage = { sortDate: -1 };
        break;
      case "lowtohigh":
        sortStage = { numericPrice: 1, popularity_score: -1 };
        break;
      case "hightolow":
        sortStage = { numericPrice: -1, popularity_score: -1 };
        break;
      case "popularity":
      default:
        sortStage = { popularity_score: -1 };
        break;
    }

    const pipeline = [
      { $match: matchStage },

      {
        $addFields: {
          numericPrice: priceExpr,
          sortDate: {
            $ifNull: [
              { $arrayElemAt: ["$featured_images.createdAt", 0] },
              { $ifNull: ["$createdAt", new Date(0)] },
            ],
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
                featured_images: 1,
                price: 1,
                cost_price: 1,
                ratings: 1,
                popularity_score: 1,
                designType: 1,
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
      message: decorations.length > 0 ? "Search Successful" : "No matching decorations found.",
      data: decorations,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
    };

    cache.set(cacheKey, response);
    return res.json(response);
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});




router.get("/decorations/:name/orders", async (req, res, next) => {
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
    error.isPublic = true;
    next(error);
  }
});

// delete images by iamge name
router.post("/delete-image", async (req, res, next) => {
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
    error.isPublic = true;
    next(error);
  }
});

module.exports = router;
