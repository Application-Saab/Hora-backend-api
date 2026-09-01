const Lead = require('../models/leads'); // Path verify kar lena
const { google } = require("googleapis");
const fs = require("fs");
const express = require("express");
const router = express.Router();
const Order = require("../models/order"); 

const credentials = JSON.parse(fs.readFileSync("google-sheet.json", "utf-8"));
const { client_email, private_key } = credentials;
const spreadsheetId = "1q4i0Zu5MmRzme6ArkkWz5m2NbCCQIxdScF7Z9eFHEm0";

const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

function parseSheetDate(dateStr) {
    if (!dateStr) return new Date();

    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;

    // Handles DD/MM/YYYY or DD-MM-YYYY
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
        const [day, month, year] = parts.map((p) => p.trim());
        const formattedDate = new Date(`${year}-${month}-${day}`);
        if (!isNaN(formattedDate.getTime())) return formattedDate;
    }

    return new Date();
}

async function getSheetData(range) {
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    const rows = response.data.values || [];
    if (!rows.length) return [];

    // Headers se extra spaces trim karo
    const headers = rows[0].map((h) => String(h).trim());

    return rows.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] ? String(row[i]).trim() : "";
        });
        return obj;
    });
}

async function syncLeadsFromSheet() {
    try {
        console.log("hello ----- [Incremental Sheet Sync Triggered]");

        let tracker = await Lead.findOne({ phoneNumber: "SYNC_TRACKER_ROW" });

        let startRow = 2; 
        if (tracker && tracker.lastSyncedRow && tracker.lastSyncedRow > 0) {
            startRow = tracker.lastSyncedRow + 1; 
        }

        const range = `Assigned leads!A${startRow}:Z`;
        console.log(`[Cron] Fetching new data starting from Row: ${startRow}...`);

        const sheets = google.sheets({ version: "v4", auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const newRows = response.data.values || [];

        if (!newRows.length) {
            console.log("[Cron] No new rows added in Google Sheet.");
            return;
        }

        console.log(`[Cron] Found ${newRows.length} new rows. Processing...`);

        const leadsToInsert = [];

        for (const row of newRows) {

            const rawPhone = row[0] || "";
            const rawAgent = row[1] || "";
            const rawSource = row[2] || "";
            const rawDate = row[3] || null;

            if (!rawPhone && !rawAgent) continue; 

            leadsToInsert.push({
                phoneNumber: String(rawPhone).trim(),
                agentName: String(rawAgent).trim(),
                source: String(rawSource).trim(), 
                date: parseSheetDate(rawDate),    
                lastSyncedRow: 0
            });
        }

        if (leadsToInsert.length > 0) {
            await Lead.insertMany(leadsToInsert);
        }

        const newLastRow = startRow + newRows.length - 1;

        await Lead.findOneAndUpdate(
            { phoneNumber: "SYNC_TRACKER_ROW" },
            {
                phoneNumber: "SYNC_TRACKER_ROW",
                agentName: "SYSTEM_TRACKER",
                source: "SYSTEM_TRACKER",
                lastSyncedRow: newLastRow, 
                date: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`[Cron] Sync finished! Successfully processed till Row ${newLastRow}.`);

    } catch (error) {
        console.error("[Cron Error] Failed to sync leads:", error.message);
    }
}

const formatAnalyticsList = (list) => {
    return (list || []).map((item) => {
        const total = item.totalLeadsAssigned || 0;
        const confirmed = item.orderConfirmed || 0;
        const ratio = total > 0 ? ((confirmed / total) * 100).toFixed(2) : "0.00";

        return {
            name: item._id || "Unknown",
            totalLeadsAssigned: total,
            orderConfirmed: confirmed,
            conversionRatio: `${ratio}%`
        };
    });
};

const getAnalyticsPipeline = (groupByField) => [
    {
        $match: {
            phoneNumber: { $ne: "SYNC_TRACKER_ROW" }
        }
    },
    {
        $lookup: {
            from: "orders",
            localField: "phoneNumber",
            foreignField: "phone_no",
            as: "matchedOrders"
        }
    },
    {
        $addFields: {
            isConfirmed: { $gt: [{ $size: "$matchedOrders" }, 0] }
        }
    },
    {
        $group: {
            _id: `$${groupByField}`,
            totalLeadsAssigned: { $sum: 1 },
            orderConfirmed: { $sum: { $cond: ["$isConfirmed", 1, 0] } }
        }
    },
    { $sort: { totalLeadsAssigned: -1 } }
];

router.get("/agent-analytics", async (req, res) => {
    try {
        const result = await Lead.aggregate(getAnalyticsPipeline("agentName"));
        return res.status(200).json({
            error: false,
            message: "Agent analytics fetched successfully",
            data: formatAnalyticsList(result)
        });
    } catch (error) {
        console.error("Error fetching agent analytics:", error);
        return res.status(500).json({
            error: true,
            message: "Server error fetching agent analytics",
            details: error.message
        });
    }
});

router.get("/source-analytics", async (req, res) => {
    try {
        const result = await Lead.aggregate(getAnalyticsPipeline("source"));
        return res.status(200).json({
            error: false,
            message: "Source analytics fetched successfully",
            data: formatAnalyticsList(result)
        });
    } catch (error) {
        console.error("Error fetching source analytics:", error);
        return res.status(500).json({
            error: true,
            message: "Server error fetching source analytics",
            details: error.message
        });
    }
});

module.exports = {
    router,
    syncLeadsFromSheet
};