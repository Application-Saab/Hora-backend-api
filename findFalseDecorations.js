const mongoose = require("mongoose");
// Apne Decoration model ka path yahan adjust kar lena
const Decoration = require("./models/decoration"); 

// Apna MongoDB connection string yahan daal do
const MONGO_URI = "mongodb+srv://horaApp:developer123@cluster0.mx5lhta.mongodb.net/test?retryWrites=true&w=majority";

function cleanAndParseDesignType(rawDesignType) {
  if (!rawDesignType) return {};

  let targetString = null;

  // Case 1: Agar Direct JSON String hai
  if (typeof rawDesignType === "string") {
    targetString = rawDesignType;
  }
  // Case 2: Agar character-by-character index object hai ('0': '{', '1': '"', ...)
  else if (typeof rawDesignType === "object" && !Array.isArray(rawDesignType)) {
    // Agar index keys ('0', '1', '2') present hain, to unhe rebuild karke JSON string banao
    const numericKeys = Object.keys(rawDesignType).filter((k) => !isNaN(k)).sort((a, b) => Number(a) - Number(b));

    if (numericKeys.length > 0) {
      targetString = numericKeys.map((k) => rawDesignType[k]).join("");
    } else {
      // Agar direct key-values hain, to simple check & fallback
      return rawDesignType;
    }
  }

  // String ko valid JSON Object me parse karo
  if (targetString) {
    try {
      const parsed = JSON.parse(targetString);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn("JSON Parse Warning: Failed to parse reconstituted string:", targetString.substring(0, 50));
    }
  }

  return null;
}

async function fixDesignTypeData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB...");

    const cursor = Decoration.find({}, { _id: 1, name: 1, designType: 1 }).cursor();

    let totalChecked = 0;
    let fixedCount = 0;
    let failedCount = 0;

    const bulkOps = [];

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      totalChecked++;
      const dt = doc.designType;

      // Check karo ki data already valid hai ya clean karna hoga
      const isPlainObj = dt && typeof dt === "object" && !Array.isArray(dt);
      const hasOnlyBooleans = isPlainObj && Object.keys(dt).every((k) => isNaN(k) && typeof dt[k] === "boolean");

      // Valid object ko ignore karenge
      if (hasOnlyBooleans) continue;

      // Corrupted data fix karo
      const cleanedObj = cleanAndParseDesignType(dt);

      if (cleanedObj) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { designType: cleanedObj } },
          },
        });
        fixedCount++;
      } else {
        console.error(`❌ Could not fix _id: ${doc._id} (${doc.name})`);
        failedCount++;
      }

      // Performance optimization: Har 500 records par bulk update execute karo
      if (bulkOps.length >= 500) {
        await Decoration.bulkWrite(bulkOps);
        bulkOps.length = 0;
        console.log(`Processed batch... Fixed ${fixedCount} documents so far.`);
      }
    }

    // Remaining operations execute karo
    if (bulkOps.length > 0) {
      await Decoration.bulkWrite(bulkOps);
    }

    console.log("\n--- MIGRATION SUMMARY ---");
    console.log(`Total Checked: ${totalChecked}`);
    console.log(`Successfully Fixed: ${fixedCount}`);
    console.log(`Failed/Unresolved: ${failedCount}`);
    console.log("-------------------------\n");

  } catch (error) {
    console.error("Migration Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

fixDesignTypeData();