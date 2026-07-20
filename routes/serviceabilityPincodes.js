const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const Serviceability = require("../models/serviceabilityPincodes"); 

const router = express.Router();

const credentials = JSON.parse(
    fs.readFileSync("google-sheet.json", "utf-8")
);

const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const SPREADSHEET_ID = "1cvhx5hWUn-Fr68_OEpx-uhqwPy6jsYU6t2ady1SdzS4";
const RANGE = "Pincode List!B:D";

router.post("/sync", async (req, res) => {
    try {
        await auth.authorize();

        const sheets = google.sheets({
            version: "v4",
            auth,
        });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE,
        });

        const rows = response.data.values || [];

        if (!rows.length || rows.length <= 1) {
            return res.status(400).json({
                success: false,
                message: "No data found in the Google Sheet range."
            });
        }

        await Serviceability.deleteMany({});
        console.log("Purana saara data clear kar diya gaya hai.");

        const dataRows = rows.slice(1); 

        const finalDataToInsert = [];

        dataRows.forEach((row) => {
            const pincode = row[0] ? row[0].toString().trim() : "";
            const city = row[1] ? row[1].toString().trim() : "";
            const status = row[2] ? row[2].toString().trim() : "";

            if (!pincode && !city) return;

            if (pincode.toLowerCase() === "pincode" || pincode.toLowerCase() === "column_1") return;

            finalDataToInsert.push({
                pincode,
                city,
                status
            });
        });

        if (finalDataToInsert.length > 0) {
            await Serviceability.insertMany(finalDataToInsert);
        }

        return res.json({
            success: true,
            message: `Successfully synced ${finalDataToInsert.length} clean records to MongoDB.`,
        });

    } catch (error) {
        console.error("Sync Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to sync sheet data.",
            error: error.message,
        });
    }
});


router.get("/serviceability", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const status = req.query.status || "";
        const category = req.query.category || "";

        const startIndex = (page - 1) * limit;

        const filter = {};

        if (search) {
            filter.$or = [
                { pincode: { $regex: search, $options: "i" } },
                { city: { $regex: search, $options: "i" } }
            ];
        }

        if (status) {
            filter.status = status;
        }

        if (category) {
            if (category === "N/A") {
                filter.$or = [
                    { category: { $exists: false } },
                    { category: "" },
                    { category: null }
                ];
            } else {
                filter.category = category;
            }
        }

        const totalRecords = await Serviceability.countDocuments(filter);
        const totalPages = Math.ceil(totalRecords / limit);

        const data = await Serviceability.find(filter)
            .skip(startIndex)
            .limit(limit)
            .select("pincode city status category")
            .lean();

        return res.json({
            success: true,
            page,
            limit,
            totalPages,
            totalRecords,
            data,
        });
    } catch (error) {
        console.error("Fetch Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch data.",
            error: error.message,
        });
    }
});

router.put("/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { pincode, city, status, category } = req.body; 

        const updateData = {};

        if (pincode !== undefined) updateData.pincode = pincode.toString().trim();
        if (city !== undefined) updateData.city = city.toString().trim();
        if (status !== undefined) updateData.status = status.toString().trim();
        if (category !== undefined) updateData.category = category.toString().trim(); 

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least one field to update."
            });
        }

        const updatedRecord = await Serviceability.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ success: false, message: "Record not found." });
        }

        return res.json({
            success: true,
            message: "Record updated successfully!",
            data: updatedRecord
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;