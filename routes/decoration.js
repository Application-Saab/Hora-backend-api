const express = require("express");
const orderModel = require("../models/order");
const router = express.Router();
const AddressModel = require("../models/address");
const decorationModel = require("../models/decoration");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 60 * 10 }); // 10 minutes TTL
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");

sharp.concurrency(1);
sharp.cache(false);

const TEMP_UPLOAD_DIR = path.resolve(__dirname, "../uploads/temp");
const IMAGE_OUTPUT_DIR = path.resolve(__dirname, "../uploads/compressed_webp");
const VIDEO_OUTPUT_DIR = path.resolve(__dirname, "../uploads/compressed_webp");

[TEMP_UPLOAD_DIR, IMAGE_OUTPUT_DIR, VIDEO_OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const isVideoMimeOrExt = (file) => {
  if (!file) return false;
  if (file.mimetype && file.mimetype.startsWith("video/")) return true;
  return /\.(mp4|webm|ogg|mov|mkv|avi)$/i.test(file.originalname || file.fileName || "");
};

const sanitizeBaseName = (originalName) => {
  return path
    .parse(originalName)
    .name.replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
};

// Multer Disk Storage (Safe for large videos & multiple images)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB max per file
  },
});

const clearTagCaches = (tags = []) => {
  if (!Array.isArray(tags)) return;
  tags.forEach((t) => {
    if (t) {
      cache.del(`search_tag_${t}`);
    }
  });
};

const deleteFileIfExists = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("File delete error:", err);
  }
};

// Delete media file from correct folder (image or video)
const deleteMediaByFileName = (fileName) => {
  if (!fileName) return;
  const isVid = /\.(mp4|webm|ogg|mov|mkv|avi)$/i.test(fileName);
  const folder = isVid ? VIDEO_OUTPUT_DIR : IMAGE_OUTPUT_DIR;
  deleteFileIfExists(path.join(folder, fileName));
};

const compressImageToWebP = async (inputSource, outputPath, targetMaxKB = 40) => {
  let quality = 85;
  const step = 5;

  while (quality > 5) {
    const compressedBuffer = await sharp(inputSource)
      .webp({ quality })
      .toBuffer();

    const sizeKB = compressedBuffer.length / 1024;

    if (sizeKB <= targetMaxKB) {
      await fsPromises.writeFile(outputPath, compressedBuffer);
      return true;
    }

    quality -= step;
  }

  const fallbackBuffer = await sharp(inputSource)
    .webp({ quality: 5 })
    .toBuffer();
  await fsPromises.writeFile(outputPath, fallbackBuffer);
  return false;
};

const normalizeInclusion = (inclusion) => {
  if (!inclusion) return [];

  try {
    if (typeof inclusion === "string" && inclusion.startsWith("[")) {
      inclusion = JSON.parse(inclusion);
    }

    if (typeof inclusion === "string") {
      return [inclusion];
    }

    if (Array.isArray(inclusion)) {
      return [inclusion.filter(Boolean).join("")];
    }

    return [];
  } catch (err) {
    console.error("normalizeInclusion error", err);
    return [];
  }
};

// ============================================================================
// BACKGROUND VIDEO COMPRESSION QUEUE
// ============================================================================
const videoJobQueue = [];
let isProcessingVideo = false;

const compressVideoFile = (inputPath, tempCompressedPath) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`🎬 [BG VIDEO] Compression started: ${path.basename(inputPath)}`);

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .videoFilters("scale='min(1080,iw)':-2")
      .outputOptions([
        "-crf 26",
        "-preset veryfast",
        "-profile:v high",
        "-level 4.1",
        "-pix_fmt yuv420p",
        "-maxrate 2200k",
        "-bufsize 4400k",
        "-threads 1",
        "-c:a aac",
        "-b:a 96k",
        "-movflags +faststart",
      ])
      .on("end", () => {
        const sec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [BG VIDEO] Done in ${sec}s: ${path.basename(inputPath)}`);
        resolve(tempCompressedPath);
      })
      .on("error", (err) => {
        console.error(`❌ [BG VIDEO] Failed:`, err.message);
        reject(err);
      })
      .save(tempCompressedPath);
  });
};

const enqueueVideoCompression = (job) => {
  videoJobQueue.push(job);
  processNextVideoJob();
};

const processNextVideoJob = async () => {
  if (isProcessingVideo || videoJobQueue.length === 0) return;
  isProcessingVideo = true;

  const { decorationId, fileName, tags = [] } = videoJobQueue.shift();
  const targetFilePath = path.join(VIDEO_OUTPUT_DIR, fileName);
  const tempOutPath = path.join(TEMP_UPLOAD_DIR, `comp_${fileName}`);

  try {
    const currentDoc = await decorationModel.findById(decorationId).lean();
    const stillExistsInArray = currentDoc?.featured_images?.some(
      (m) => m.fileName === fileName
    );

    if (!currentDoc || !stillExistsInArray || !fs.existsSync(targetFilePath)) {
      console.log(`⏭️ [BG VIDEO] Skipped obsolete video job: ${fileName}`);
      deleteFileIfExists(tempOutPath);
      return;
    }

    await compressVideoFile(targetFilePath, tempOutPath);

    // Re-check before replacing
    const latestDoc = await decorationModel.findById(decorationId).lean();
    const stillValid = latestDoc?.featured_images?.some(
      (m) => m.fileName === fileName
    );
    if (!latestDoc || !stillValid) {
      deleteFileIfExists(tempOutPath);
      return;
    }

    const rawSizeMB = (fs.statSync(targetFilePath).size / (1024 * 1024)).toFixed(2);
    const compSizeMB = (fs.statSync(tempOutPath).size / (1024 * 1024)).toFixed(2);

    // Atomic overwrite: Original raw video permanently deleted & replaced by compressed MP4
    await fsPromises.rename(tempOutPath, targetFilePath);

    await decorationModel.updateOne(
      { _id: decorationId, "featured_images.fileName": fileName },
      { $set: { "featured_images.$.videoStatus": "ready" } }
    );

    clearTagCaches(tags);
    console.log(`📦 [BG VIDEO] Replaced ${fileName} (${rawSizeMB}MB -> ${compSizeMB}MB)`);
  } catch (err) {
    deleteFileIfExists(tempOutPath);
    await decorationModel
      .updateOne(
        { _id: decorationId, "featured_images.fileName": fileName },
        { $set: { "featured_images.$.videoStatus": "ready" } }
      )
      .catch(() => {});
  } finally {
    isProcessingVideo = false;
    processNextVideoJob();
  }
};

// Process mixed uploaded files (images + videos) into unified featured_images items
const processUploadedMediaFiles = async (files = []) => {
  const processedItems = [];
  const queuedVideoNames = [];

  for (const file of files) {
    const cleanName = sanitizeBaseName(file.originalname);
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;

    if (isVideoMimeOrExt(file)) {
      const fileName = `${uniquePrefix}-${cleanName}.mp4`;
      const finalPath = path.join(VIDEO_OUTPUT_DIR, fileName);

      // Move from temp to compressed_webp (will be overwritten once FFmpeg finishes)
      await fsPromises.rename(file.path, finalPath);

      processedItems.push({
        fileName,
        url: `/uploads/compressed_webp/${fileName}`,
        mediaType: "video",
        videoStatus: "processing",
        createdAt: new Date(),
      });
      queuedVideoNames.push(fileName);
    } else {
      const fileName = `${uniquePrefix}-${cleanName}.webp`;
      const outputPath = path.join(IMAGE_OUTPUT_DIR, fileName);

      await compressImageToWebP(file.path, outputPath);
      deleteFileIfExists(file.path);

      processedItems.push({
        fileName,
        url: `/uploads/compressed_webp/${fileName}`,
        mediaType: "image",
        videoStatus: "ready",
        createdAt: new Date(),
      });
    }
  }

  return { processedItems, queuedVideoNames };
};

// ============================================================================
// ADD ROUTE (Unified `featured_images` for Single/Multiple Images & Videos)
// ============================================================================
router.post(
  "/add",
  upload.fields([
    { name: "featured_images", maxCount: 10 },
    { name: "featured_image", maxCount: 1 }, // Legacy fallback support
  ]),
  async (req, res, next) => {
    const allIncomingFiles = [
      ...(req.files?.featured_images || []),
      ...(req.files?.featured_image || []),
    ];

    try {
      if (allIncomingFiles.length === 0) {
        return res.status(400).json({
          error: true,
          message: "At least one image or video is required",
        });
      }

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

      const existingDecoration = await decorationModel.findOne({ name, type });
      if (existingDecoration) {
        allIncomingFiles.forEach((f) => deleteFileIfExists(f.path));
        return res.json({
          error: true,
          status: 503,
          message: "Decoration already added.",
        });
      }

      const { processedItems, queuedVideoNames } =
        await processUploadedMediaFiles(allIncomingFiles);

      // Sync legacy `featured_image` with first image (if any) for older APIs
      const firstImageItem = processedItems.find((m) => m.mediaType === "image");
      const legacyPrimaryImage = firstImageItem
        ? firstImageItem.fileName
        : processedItems[0]?.fileName || null;

      const parsedTags = tag
        ? typeof tag === "string"
          ? JSON.parse(tag)
          : tag
        : [];

      const data = new decorationModel({
        name,
        short_link,
        featured_image: legacyPrimaryImage,
        featured_images: processedItems,
        caption,
        badge,
        price,
        cost_price,
        type,
        is_wishlisted,
        ratings,
        attributes,
        inclusion,
        tag: parsedTags,
      });

      const savedData = await data.save();

      if (parsedTags.length > 0) {
        clearTagCaches(parsedTags);
      }

      // Queue all uploaded videos for background compression
      queuedVideoNames.forEach((videoFileName) => {
        enqueueVideoCompression({
          decorationId: savedData._id,
          fileName: videoFileName,
          tags: parsedTags,
        });
      });

      return res.json({
        error: false,
        status: 200,
        message:
          queuedVideoNames.length > 0
            ? "Decoration added successfully. Video is compressing in background."
            : "Decoration added successfully",
        data: savedData,
      });
    } catch (err) {
      allIncomingFiles.forEach((f) => deleteFileIfExists(f.path));
      next(err);
    }
  }
);

// ============================================================================
// EDIT ROUTE (Unified `featured_images`: Add/Remove Images & Videos)
// ============================================================================
router.post(
  "/edit",
  upload.array("featured_images", 10),
  async (req, res, next) => {
    const uploadedFiles = req.files || [];

    try {
      const id = req.body._id;
      const existing = await decorationModel.findById(id);

      if (!existing) {
        uploadedFiles.forEach((f) => deleteFileIfExists(f.path));
        return res.status(404).json({
          error: true,
          message: "Decoration not found",
        });
      }

      let existingMedia = Array.isArray(existing.featured_images)
        ? [...existing.featured_images]
        : [];
      const oldTags = Array.isArray(existing.tag) ? existing.tag : [];

      // -----------------------------
      // 1. REMOVE MEDIA (Images OR Videos)
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

        if (Array.isArray(removedImages) && removedImages.length > 0) {
          removedImages.forEach((item) => {
            const targetName = typeof item === "string" ? item : item?.fileName;
            deleteMediaByFileName(targetName);
          });

          existingMedia = existingMedia.filter(
            (m) =>
              !removedImages.some(
                (r) => (typeof r === "string" ? r : r?.fileName) === m.fileName
              )
          );
        }
      }

      // -----------------------------
      // 2. PROCESS NEW UPLOADS (Images OR Videos)
      // -----------------------------
      const { processedItems: newMediaItems, queuedVideoNames } =
        await processUploadedMediaFiles(uploadedFiles);

      const finalMediaList = [...existingMedia, ...newMediaItems];

      // Keep legacy `featured_image` synced
      const firstImage = finalMediaList.find(
        (m) => m.mediaType === "image" || !/\.(mp4|webm|ogg|mov)$/i.test(m.fileName)
      );
      const legacyPrimaryImage = firstImage
        ? firstImage.fileName
        : finalMediaList[0]?.fileName || null;

      // -----------------------------
      // 3. UPDATE DB
      // -----------------------------
      const inclusion = normalizeInclusion(req.body.inclusion);

      let parsedTags = [];
      if (req.body.tag) {
        parsedTags =
          typeof req.body.tag === "string"
            ? JSON.parse(req.body.tag)
            : req.body.tag;
      }

      const updated = await decorationModel.findByIdAndUpdate(
        id,
        {
          name: req.body.name,
          price: req.body.price,
          tag: parsedTags,
          designType:
            typeof req.body.designType === "string"
              ? JSON.parse(req.body.designType)
              : req.body.designType,
          inclusion,
          inclusionVariables:
            typeof req.body.inclusionVariables === "string"
              ? JSON.parse(req.body.inclusionVariables)
              : req.body.inclusionVariables,
          featured_image: legacyPrimaryImage,
          featured_images: finalMediaList,
        },
        { new: true }
      );

      // -----------------------------
      // 4. CACHE INVALIDATION & BG VIDEO QUEUE
      // -----------------------------
      const combinedTags = Array.from(new Set([...oldTags, ...parsedTags]));
      clearTagCaches(combinedTags);

      queuedVideoNames.forEach((videoFileName) => {
        enqueueVideoCompression({
          decorationId: updated._id,
          fileName: videoFileName,
          tags: combinedTags,
        });
      });

      return res.json({
        error: false,
        message:
          queuedVideoNames.length > 0
            ? "Updated successfully. Video is compressing in background."
            : "Updated successfully",
        data: updated,
      });
    } catch (err) {
      uploadedFiles.forEach((f) => deleteFileIfExists(f.path));
      next(err);
    }
  }
);

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
      await decorationModel.findByIdAndUpdate(_id, {
        $set: { status: status },
      });

      // Status badalne par bhi related tags cache se hata do
      if (decoration.tag) {
        clearTagCaches(decoration.tag);
      }

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

const normalizeDecorationName = (name = "") => {
  return decodeURIComponent(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

router.get("/searchByName/:name", async (req, res, next) => {
  try {
    const requestedName = normalizeDecorationName(req.params.name);
    const allDecorations = await decorationModel.find({}).lean();

    const decorations = allDecorations.filter((decoration) => {
      const dbName = normalizeDecorationName(decoration.name);
      return dbName === requestedName;
    });

    if (decorations.length > 0) {
      return res.json({
        error: false,
        status: 200,
        message: "Search Successful",
        data: decorations,
      });
    }
    return res.json({
      error: true,
      status: 404,
      message: "No matching decorations found.",
    });
  } catch (error) {
    error.isPublic = true;
    next(error);
  }
});

router.get("/panel-searchByName/:name", async (req, res, next) => {
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

router.get("/searchByTag/v3/:tag", async (req, res, next) => {
  try {
    const { tag } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 1000);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const theme = req.query.theme;
    const search = req.query.search?.trim();
    const designType = req.query.designType?.trim();
    const rawDesignType = req.query.designType;

    const designTypes = [
      ...new Set(
        (Array.isArray(rawDesignType)
          ? rawDesignType
          : rawDesignType
            ? String(rawDesignType).split(",")
            : []
        )
          .map((type) => type.trim())
          .filter(Boolean),
      ),
    ];

    // ---- Sort (mirrors SearchSortBar sortOptions) ----
    // popularity | newArrival | lowToHigh | highToLow
    const sortBy = (req.query.sortBy || "popularity").toLowerCase();

    // ---- Price range (mirrors ThemeSelector priceRange buckets) ----
    // Frontend sends numeric minPrice/maxPrice directly.
    // For open-ended "stage" bucket (12001-Infinity), simply omit maxPrice.
    const minPrice =
      req.query.minPrice !== undefined ? Number(req.query.minPrice) : null;
    const maxPrice =
      req.query.maxPrice !== undefined &&
      req.query.maxPrice !== "" &&
      req.query.maxPrice !== "Infinity"
        ? Number(req.query.maxPrice)
        : null;

    // const cacheKey = `search_${tag}_${limit}_${page}_${minPrice ?? "noMin"}_${maxPrice ?? "noMax"}_${sortBy}_${theme || "all"}_${search || "noSearch"}`;
    // const cacheKey = `search_${tag}_${limit}_${page}_${minPrice ?? "noMin"}_${maxPrice ?? "noMax"}_${sortBy}_${theme || "all"}_${search || "noSearch"}_${designType || "allDesigns"}`;
    const cacheKey = `search_${tag}_${limit}_${page}_${minPrice ?? "noMin"}_${maxPrice ?? "noMax"}_${sortBy}_${theme || "all"}_${search || "noSearch"}_${designTypes.sort().join("|") || "allDesigns"}`;
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
        matchStage.$expr =
          conditions.length > 1 ? { $and: conditions } : conditions[0];
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

    // Multi-select Design Type filter (OR logic)
    if (designTypes.length > 0) {
      const designTypeCondition = {
        $or: designTypes.map((type) => ({
          [`designType.${type}`]: true,
        })),
      };

      matchStage.$and = [...(matchStage.$and || []), designTypeCondition];
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
