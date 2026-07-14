const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");

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

router.get("/serviceability", async (req, res) => {
    try {
        await auth.authorize();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const sheets = google.sheets({
            version: "v4",
            auth,
        });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE,
        });

        const rows = response.data.values || [];

        if (!rows.length) {
            return res.json({
                success: true,
                data: [],
                page: 1,
                totalPages: 0,
                totalRecords: 0,
            });
        }

        const headers = rows[0];

        const allData = rows
            .slice(1)
            .filter((row) =>
                row.some((cell) => cell && cell.toString().trim() !== "")
            )
            .map((row) => {
                const obj = {};

                headers.forEach((header, index) => {
                    obj[header || `column_${index + 1}`] = row[index] || "";
                });

                return obj;
            });

        const totalRecords = allData.length;
        const totalPages = Math.ceil(totalRecords / limit);

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedData = allData.slice(startIndex, endIndex);

        return res.json({
            success: true,
            page,
            limit,
            totalPages,
            totalRecords,
            data: paginatedData,
        });
    } catch (error) {
        console.error("Google Sheet Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

module.exports = router;