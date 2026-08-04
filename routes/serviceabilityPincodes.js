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

router.post("/sync", async (req, res, next) => {
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
        error.isPublic = true;
        next(error);
    }
});


router.get("/serviceability", async (req, res, next) => {
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
        error.isPublic = true;
        next(error);
    }
});

router.put("/update/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, category } = req.body;

        const categoryArray = Array.isArray(category) ? category : [category];

        const updatedPincode = await Serviceability.findByIdAndUpdate(
            id,
            {
                status,
                category: categoryArray
            },
            { new: true }
        );

        if (!updatedPincode) {
            return res.status(404).json({ success: false, message: "Pincode not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Pincode updated successfully",
            data: updatedPincode
        });
    } catch (error) {
        console.error("Update error:", error);
        error.isPublic = true;
        next(error);
    }
});

module.exports = router;