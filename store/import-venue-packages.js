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
// ================== SUMMARY COUNTERS ==================
const stats = {
  packages: {
    loaded: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    venueNotFound: 0,
  },
  items: {
    loaded: 0,
    created: 0,
    updated: 0,
    errors: 0,
  },
  categories: {
    created: 0,
    updated: 0,
  },
  addons: {
    loaded: 0,
  },
  tags: {
    loaded: 0,
  },
  // NEW: missing venues list
  missingVenues: new Set(),
};

function printSummary() {
  console.log("\n" + "=".repeat(50));
  console.log("           PACKAGE SYNC SUMMARY");
  console.log("=".repeat(50));

  console.log("\n📦 PACKAGES:");
  console.log(`   Loaded from sheet      : ${stats.packages.loaded}`);
  console.log(`   Created                : ${stats.packages.created}`);
  console.log(`   Skipped (already exist): ${stats.packages.skipped}`);
  console.log(`   Venue Not Found        : ${stats.packages.venueNotFound}`);
  console.log(`   Errors                 : ${stats.packages.errors}`);

  // ===== Missing Venues List =====
  if (stats.missingVenues.size > 0) {
    console.log("\n❌ VENUES NOT FOUND IN DB:");
    [...stats.missingVenues].forEach((venue, index) => {
      console.log(`   ${index + 1}. ${venue}`);
    });
  }

  console.log("\n🍽️  ITEMS:");
  console.log(`   Loaded from sheet      : ${stats.items.loaded}`);
  console.log(`   Created                : ${stats.items.created}`);
  console.log(`   Updated                : ${stats.items.updated}`);
  console.log(`   Errors                 : ${stats.items.errors}`);

  console.log("\n🏷️  CATEGORIES:");
  console.log(`   Created                : ${stats.categories.created}`);
  console.log(`   Updated (casing)       : ${stats.categories.updated}`);

  console.log("\n➕ ADDONS:");
  console.log(`   Loaded                 : ${stats.addons.loaded}`);

  console.log("\n🔖 TAGS:");
  console.log(`   Loaded                 : ${stats.tags.loaded}`);

  console.log("\n" + "=".repeat(50));
}

// Normalization functions
function normalize(value) {
  return String(value || "").trim();
}

function normalizeForDb(title) {
  return normalize(title).toLowerCase();
}

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
  const data = rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] || "";
    });
    return obj;
  });

  return data;
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
    stats.items.loaded++;
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
    stats.addons.loaded++;
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
      stats.tags.loaded++;
    }
  }

  return map;
}

async function getOrCreateCategory(categoryTitle) {
  const originalTitle = normalize(categoryTitle);
  if (!originalTitle) return null;

  const searchTitle = normalizeForDb(categoryTitle);

  let category = await PackageCategory.findOne({
    title: { $regex: new RegExp(`^${searchTitle}$`, "i") },
  });

  if (!category) {
    category = await PackageCategory.create({
      title: toTitleCase(originalTitle),
    });
    stats.categories.created++;
  } else if (category.title !== toTitleCase(originalTitle)) {
    category.title = toTitleCase(originalTitle);
    await category.save();
    stats.categories.updated++;
  }

  return category;
}

async function getOrCreateItem(itemTitle, categoryTitle, foodType) {
  const originalTitle = normalize(itemTitle);
  if (!originalTitle) {
    console.log(`   ⚠️  Empty item title skipped`);
    return null;
  }

  try {
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
      stats.items.created++;
      console.log(`   ➕ Created Item: ${item.title}`);
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
    }

    const newFoodType = normalize(foodType || "veg").toLowerCase();
    
    // Schema me enum: ["veg", "non-veg", "mixed"]
    // if (!["veg", "non-veg", "mixed"].includes(newFoodType)) {
    //   console.log(`   ⚠️  Invalid foodType "${newFoodType}" for item "${item.title}" → keeping old`);
    // } else 
    if (item.foodType !== newFoodType) {
      item.foodType = newFoodType;
      updated = true;
    }

    if (updated) {
      await item.save();
      stats.items.updated++;
      console.log(`   🔄 Updated Item: ${item.title}`);
    }

    return item;
  } catch (err) {
    stats.items.errors++;
    console.error(`   ❌ Item error "${itemTitle}":`, err.message);
    return null;
  }
}

async function syncPackages() {
  console.log("\n===== PACKAGE SYNC STARTED =====\n");

  const packageRows = await getPackagesRows();
  const itemsMap = await getPackageItems();
  const addonsMap = await getPackageAddons();
  const tagsMap = await getPackageCategoryTags();

  stats.packages.loaded = packageRows.length;

  console.log(`Packages loaded from sheet : ${packageRows.length}`);
  console.log(`Items loaded from sheet    : ${stats.items.loaded}`);
  console.log(`Addons loaded              : ${stats.addons.loaded}`);
  console.log(`Tags loaded                : ${stats.tags.loaded}\n`);

  for (const row of packageRows) {
    try {
      const venueName = normalize(row.venueName);
      const packageName = normalize(row.title);

      const venue = await Venues.findOne({ venueName });

      if (!venue) {
        stats.packages.venueNotFound++;
        stats.missingVenues.add(venueName);
        continue;
      }

      let existing = await VenuePackage.findOne({
        venueId: venue._id,
        title: packageName,
      });

      // ========== ITEMS PROCESS (hamesha) ==========
      const itemData = itemsMap.get(`${venueName}|${packageName}`) || [];
      const packageItems = [];

      console.log(`\n→ Processing Package: "${packageName}" | Venue: "${venueName}" | Items in sheet: ${itemData.length}`);

      for (const it of itemData) {
        const item = await getOrCreateItem(
          it.itemTitle,
          it.categoryTitle,
          it.foodType,
        );
        if (item) {
          packageItems.push(item._id);
        } else {
          console.log(`   ⚠️  Item failed: "${it.itemTitle}"`);
        }
      }

      // Addons
      const packageAddons = addonsMap.get(`${venueName}|${packageName}`) || [];

      // Category Tags
      const packageCategoriesTags =
        tagsMap.get(`${venueName}|${packageName}`) || {};

      if (existing) {
        // ===== EXISTING PACKAGE → UPDATE ITEMS =====
        existing.packageItems = packageItems;
        existing.packageAddons = packageAddons;
        existing.packageCategoriesTags = packageCategoriesTags;
        existing.subTitle = normalize(row.subTitle);
        existing.actualPrice = typeof row.actualPrice === "number" ? Number(row.actualPrice || 0) : 0;
        existing.discountedPrice = typeof row.discountedPrice === "number" ? Number(row.discountedPrice || 0) : 0;
        existing.maxGuests = typeof row.maxGuests === "number" ? Number(row.maxGuests || 0) : 0;
        existing.tag = normalize(row.tag);

        await existing.save();
        stats.packages.skipped++; // already existed, but updated
        console.log(`   ✅ Updated existing package`);
      } else {
        // ===== NEW PACKAGE → CREATE =====
        await VenuePackage.create({
          venueId: venue._id,
          title: packageName,
          subTitle: normalize(row.subTitle),
          actualPrice: typeof row.actualPrice === "number" ? Number(row.actualPrice || 0) : 0,
          discountedPrice: typeof row.discountedPrice === "number" ? Number(row.discountedPrice || 0) : 0,
          maxGuests: typeof row.maxGuests === "number" ? Number(row.maxGuests || 0) : 0,
          tag: normalize(row.tag),
          packageItems,
          packageAddons,
          packageCategoriesTags,
          packageImageUrl: "",
          packageImageKey: "",
          packageStatus: 1,
        });

        stats.packages.created++;
        console.log(`   ✅ Created new package`);
      }
    } catch (error) {
      stats.packages.errors++;
      console.error(`\n❌ Package error "${row.title}":`, error.message);
      console.error(error);
    }
  }
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
let isSyncRunning = false;

async function runPackageSync() {
  if (isSyncRunning) {
    console.log("\n⏳ Sync already running... Skipping this run.\n");
    return;
  }

  isSyncRunning = true;
  console.log("\n🔒 Sync started...\n");

  try {
    await syncPackages();
    await syncCategoriesSheet();
    await syncItemsSheet();

    printSummary();
    console.log("\n✅ All Sync Completed Successfully!");
  } catch (error) {
    console.error("Major Error:", error.message);
    printSummary();
  } finally {
    isSyncRunning = false;
    console.log("🔓 Sync finished.\n");
  }
}

module.exports = { runPackageSync };
