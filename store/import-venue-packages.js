const mongoose = require("mongoose");
const Venues = require("../models/party-venue");
const VenuePackage = require("../models/venue-packages");
const PackageItem = require("../models/venue-package-items");
const PackageCategory = require("../models/venue-package-categories");

const fs = require("fs");
const { google } = require("googleapis");

const credentials = JSON.parse(fs.readFileSync("google-sheet.json", "utf-8"));
const { client_email, private_key } = credentials;
const spreadsheetId = "1Cw6xjR-f4qmngZcuprrRz6LgyIZtSoqiEjuNIiGbTZA";

const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Normalization functions

function normalize(value) {
  return String(value || "").trim();
}

// Database case-insensitive search
function normalizeForDb(title) {
  return normalize(title).toLowerCase();
}

// Beautiful Title Case (Starter, Main Course, etc.)
function toTitleCase(str) {
  return normalize(str)
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function getSheetData(range) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = response.data.values || [];
  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] || "";
    });
    return obj;
  });
}

async function getPackagesRows() {
  return getSheetData("Packages <>Venue List!A:J");
}

async function getPackageItems() {
  const rows = await getSheetData("Package<>DIsh<>Venue List!A:E");
  const map = new Map();

  for (const row of rows) {
    const key = `${normalize(row.venueName)}|${normalize(row.packageName)}`;
    if (!map.has(key)) map.set(key, []);

    map.get(key).push({
      itemTitle: normalize(row.itemTitle),
      categoryTitle: normalize(row.categoryTitle),
      foodType: normalize(row.foodType || "veg"),
    });
  }
  return map;
}

async function getPackageAddons() {
  const rows = await getSheetData("Package<>Addons<>Venue List!A:C");
  const map = new Map();

  for (const row of rows) {
    const key = `${normalize(row.venueName)}|${normalize(row.packageName)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(normalize(row.addonTitle));
  }
  return map;
}

async function getPackageCategoryTags() {
  const rows = await getSheetData("Package<>Category Tags<>Venue List!A:D");
  const map = new Map();

  for (const row of rows) {
    const key = `${normalize(row.venueName)}|${normalize(row.packageName)}`;
    if (!map.has(key)) map.set(key, {});

    const category = await getOrCreateCategory(normalize(row.categoryTitle));
    if (category) {
      map.get(key)[category._id.toString()] = normalize(row.tagValue);
    }
  }
  return map;
}

async function getOrCreateCategory(categoryTitle) {
  const originalTitle = normalize(categoryTitle);
  if (!originalTitle) return null;

  const searchTitle = normalizeForDb(categoryTitle);

  // Case-insensitive search
  let category = await PackageCategory.findOne({
    title: { $regex: new RegExp(`^${searchTitle}$`, "i") },
  });

  if (!category) {
    category = await PackageCategory.create({
      title: toTitleCase(originalTitle), // Consistent & clean casing
    });
    console.log(`Created Category: ${category.title}`);
  } else if (category.title !== toTitleCase(originalTitle)) {
    // Update casing if needed
    category.title = toTitleCase(originalTitle);
    await category.save();
    console.log(`Updated Category casing → ${category.title}`);
  }

  return category;
}

async function getOrCreateItem(itemTitle, categoryTitle, foodType) {
  const originalTitle = normalize(itemTitle);
  if (!originalTitle) return null;

  const searchTitle = normalizeForDb(originalTitle);

  let item = await PackageItem.findOne({
    title: { $regex: new RegExp(`^${searchTitle}$`, "i") },
  });

  const category = categoryTitle
    ? await getOrCreateCategory(categoryTitle)
    : null;

  if (!item) {
    item = await PackageItem.create({
      title: toTitleCase(originalTitle),
      foodType: normalize(foodType || "veg").toLowerCase(),
      categoryIds: category ? [category._id] : [],
    });
    console.log(`Created Item: ${item.title}`);
    return item;
  }

  // Update existing item
  let updated = false;

  if (
    category &&
    !item.categoryIds.some((id) => id.toString() === category._id.toString())
  ) {
    item.categoryIds.push(category._id);
    updated = true;
    console.log(`Attached Category "${category.title}" → ${item.title}`);
  }

  const newFoodType = normalize(foodType || "veg").toLowerCase();
  if (item.foodType !== newFoodType) {
    item.foodType = newFoodType;
    updated = true;
  }

  if (updated) await item.save();

  return item;
}

async function syncPackages() {
  console.log("\n===== PACKAGE SYNC STARTED =====");

  const packageRows = await getPackagesRows();
  const itemsMap = await getPackageItems();
  const addonsMap = await getPackageAddons();
  const tagsMap = await getPackageCategoryTags();

  let created = 0,
    skipped = 0,
    errors = 0;

  for (const row of packageRows) {
    try {
      const venueName = normalize(row.venueName);
      const packageName = normalize(row.title);

      const venue = await Venues.findOne({ venueName });
      if (!venue) {
        continue;
      }

      const existing = await VenuePackage.findOne({
        venueId: venue._id,
        title: packageName,
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Items
      const itemData = itemsMap.get(`${venueName}|${packageName}`) || [];
      const packageItems = [];
      for (const it of itemData) {
        const item = await getOrCreateItem(
          it.itemTitle,
          it.categoryTitle,
          it.foodType,
        );
        if (item) packageItems.push(item._id);
      }

      // Addons
      const packageAddons = addonsMap.get(`${venueName}|${packageName}`) || [];

      // Category Tags
      const packageCategoriesTags =
        tagsMap.get(`${venueName}|${packageName}`) || {};

      await VenuePackage.create({
        venueId: venue._id,
        title: packageName,
        subTitle: normalize(row.subTitle),
        actualPrice: Number(row.actualPrice || 0),
        discountedPrice: Number(row.discountedPrice || 0),
        maxGuests: Number(row.maxGuests || 0),
        tag: normalize(row.tag),
        packageItems,
        packageAddons,
        packageCategoriesTags,
        packageImageUrl: "",
        packageImageKey: "",
        packageStatus: 1,
      });

      created++;
      console.log(`Created Package: ${packageName}`);
    } catch (err) {
      errors++;
      console.log(`Error in Package "${row.title}":`, err.message);
    }
  }

  console.log("\n===== PACKAGE SYNC SUMMARY =====");
  console.log(`Created : ${created}`);
  console.log(`Skipped : ${skipped}`);
  console.log(`Errors  : ${errors}`);
}

// ================== SYNC MASTER SHEETS ==================

async function syncCategoriesSheet() {
  const sheets = google.sheets({ version: "v4", auth });
  const categories = await PackageCategory.find({
    categoriesStatus: { $ne: 3 },
  }).lean();

  const values = [
    ["categoryId", "categoryName"],
    ...categories.map((cat) => [cat._id.toString(), cat.title]),
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "Categories",
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Categories!A1",
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function syncItemsSheet() {
  const sheets = google.sheets({ version: "v4", auth });
  const items = await PackageItem.find({
    itemsStatus: { $ne: 3 },
  })
    .populate("categoryIds", "title")
    .lean();

  const values = [
    ["itemId", "itemName", "foodType", "categories"],
    ...items.map((item) => [
      item._id.toString(),
      item.title,
      item.foodType,
      item.categoryIds.map((c) => c.title).join(" | "),
    ]),
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "Master Dump",
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Master Dump!A1",
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

// ================== MAIN RUNNER ==================

async function runPackageSync() {
  try {
    await syncPackages();
    await syncCategoriesSheet();
    await syncItemsSheet();
    console.log("\nAll Sync Completed Successfully!");
  } catch (err) {
    console.error("Major Error:", err.message);
  }
}

module.exports = { runPackageSync };
