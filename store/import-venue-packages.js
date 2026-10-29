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
    skippedExisting: 0,
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
    processed: 0,
  },
  tags: {
    loaded: 0,
    processed: 0,
  },
  missingVenues: new Set(),
};

function printSummary() {
  console.log("\n" + "=".repeat(50));
  console.log("            PACKAGE SYNC SUMMARY");
  console.log("=".repeat(50));

  console.log("\n📦 PACKAGES:");
  console.log(`   Loaded from sheet       : ${stats.packages.loaded}`);
  console.log(`   Created (New)           : ${stats.packages.created}`);
  console.log(`   Skipped (Already in DB) : ${stats.packages.skippedExisting}`);
  console.log(`   Venue Not Found         : ${stats.packages.venueNotFound}`);
  console.log(`   Errors                  : ${stats.packages.errors}`);

  if (stats.missingVenues.size > 0) {
    console.log("\n❌ VENUES NOT FOUND IN DB:");
    [...stats.missingVenues].forEach((venue, index) => {
      console.log(`   ${index + 1}. ${venue}`);
    });
  }

  console.log("\n🍽️  ITEMS:");
  console.log(`   Loaded from sheet       : ${stats.items.loaded}`);
  console.log(`   Created                 : ${stats.items.created}`);
  console.log(`   Updated                 : ${stats.items.updated}`);
  console.log(`   Errors                  : ${stats.items.errors}`);

  console.log("\n🏷️  CATEGORIES:");
  console.log(`   Created                 : ${stats.categories.created}`);
  console.log(`   Updated (casing)        : ${stats.categories.updated}`);

  console.log("\n➕ ADDONS:");
  console.log(`   Loaded from sheet       : ${stats.addons.loaded}`);
  console.log(`   Processed into new pkgs : ${stats.addons.processed}`);

  console.log("\n🔖 TAGS:");
  console.log(`   Loaded from sheet       : ${stats.tags.loaded}`);
  console.log(`   Processed into new pkgs : ${stats.tags.processed}`);

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
    const venueName = normalize(row.venueName);
    const packageName = normalize(row.packageName);
    if (!venueName || !packageName) continue;

    const key = `${venueName}|${packageName}`;
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
    const venueName = normalize(row.venueName);
    const packageName = normalize(row.packageName);
    if (!venueName || !packageName) continue;

    const key = `${venueName}|${packageName}`;
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
    const venueName = normalize(row.venueName);
    const packageName = normalize(row.packageName);
    if (!venueName || !packageName) continue;

    const key = `${venueName}|${packageName}`;
    if (!map.has(key)) map.set(key, []);

    map.get(key).push({
      categoryTitle: normalize(row.categoryTitle),
      tagValue: normalize(row.tagValue),
    });
    stats.tags.loaded++;
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
      return { item, category };
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
    if (item.foodType !== newFoodType) {
      item.foodType = newFoodType;
      updated = true;
    }

    if (updated) {
      await item.save();
      stats.items.updated++;
      console.log(`   🔄 Updated Item: ${item.title}`);
    }

    return { item, category };
  } catch (err) {
    stats.items.errors++;
    console.error(`   ❌ Item error "${itemTitle}":`, err.message);
    return null;
  }
}

// create new package
async function createNewPackage({
  venue,
  venueName,
  packageName,
  rowData,
  itemsMap,
  addonsMap,
  tagsMap,
}) {
  const key = `${venueName}|${packageName}`;
  const itemData = itemsMap.get(key) || [];
  const addonData = addonsMap.get(key) || [];
  const tagList = tagsMap.get(key) || [];

  console.log(
    `\n→ Creating NEW Package: "${packageName}" | Venue: "${venueName}" | Items: ${itemData.length} | Addons: ${addonData.length}`
  );

  // 1. Process Items
  let packageItems = [];
  for (const it of itemData) {
    const result = await getOrCreateItem(
      it.itemTitle,
      it.categoryTitle,
      it.foodType
    );

    if (result && result.item && result.category) {
      packageItems.push({
        itemId: result.item._id,
        categoryId: result.category._id,
      });
    } else if (result && result.item) {
      console.log(
        `   ⚠️  Item "${it.itemTitle}" found/created but category missing → skipped from package`
      );
    }
  }

  // 2. Process Addons
  const finalAddons = addonData;
  if (addonData.length > 0) {
    stats.addons.processed += addonData.length;
  }

  // 3. Process Tags
  const finalTags = {};
  for (const t of tagList) {
    const category = await getOrCreateCategory(t.categoryTitle);
    if (category) {
      finalTags[category._id.toString()] = t.tagValue;
      stats.tags.processed++;
    }
  }

  // 4. Create in DB
  await VenuePackage.create({
    venueId: venue._id,
    title: packageName,
    subTitle: normalize(rowData?.subTitle || ""),
    actualPrice: Number(rowData?.actualPrice) || 0,
    discountedPrice: Number(rowData?.discountedPrice) || 0,
    maxGuests: Number(rowData?.maxGuests) || 0,
    tag: normalize(rowData?.tag || ""),
    packageItems: packageItems,
    packageAddons: finalAddons,
    packageCategoriesTags: finalTags,
    packageImageUrl: "",
    packageImageKey: "",
    packageStatus: 1,
  });

  stats.packages.created++;
  console.log(`   ✅ Created new package successfully in DB`);
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

      if (!venueName || !packageName) continue;

      const venue = await Venues.findOne({ venueName });
      if (!venue) {
        stats.packages.venueNotFound++;
        stats.missingVenues.add(venueName);
        continue;
      }

      // Check DB: if package exist, will not process
      const existing = await VenuePackage.findOne({
        venueId: venue._id,
        title: packageName,
      });

      if (existing) {
        stats.packages.skippedExisting++;
        console.log(
          `⏭️  SKIP: Package "${packageName}" already exists in DB for venue "${venueName}". No updates made.`
        );
        continue;
      }

      //If not exist create new
      await createNewPackage({
        venue,
        venueName,
        packageName,
        rowData: row,
        itemsMap,
        addonsMap,
        tagsMap,
      });
    } catch (error) {
      stats.packages.errors++;
      console.error(`\n❌ Package error "${row.title}":`, error.message);
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