const Lead = require('../models/leads');
const { google } = require("googleapis");
const fs = require("fs");
const express = require("express");
const router = express.Router();
const Order = require("../models/order");
const CallLog = require('../models/callLogs');
const Team = require("../models/team");

const credentials = JSON.parse(fs.readFileSync("google-sheet.json", "utf-8"));
const { client_email, private_key } = credentials;
const spreadsheetId = "1q4i0Zu5MmRzme6ArkkWz5m2NbCCQIxdScF7Z9eFHEm0";

const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sanitizePhone = (phone) => {
    if (!phone) return "";
    const cleaned = String(phone).replace(/\D/g, "");
    return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
};

async function syncLeadsFromSheet() {
    try {
        console.log("[Incremental Sheet Sync Triggered]");

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


        const teamMembers = await Team.find({})
            .select("name number")
            .lean();

        console.log("[Cron] Team members fetched:", teamMembers.length);

        const normalizeName = (name) =>
            String(name || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");

        const leadsToInsert = [];

        for (const row of newRows) {
            const rawPhone = row[0] || "";
            const rawAgent = row[1] || "";
            const rawSource = row[2] || "";
            const rawDate = row[3] || "";

            if (!rawPhone && !rawAgent) continue;

            const agentName = String(rawAgent).trim();
            const normalizedAgent = normalizeName(agentName);

            // 1. Exact full-name match
            let teamMember = teamMembers.find(
                (member) =>
                    normalizeName(member.name) === normalizedAgent
            );

            // 2. Partial name match, only if exact match is unavailable
            if (!teamMember && normalizedAgent) {
                teamMember = teamMembers.find((member) => {
                    const teamName = normalizeName(member.name);

                    return (
                        teamName.startsWith(normalizedAgent + " ") ||
                        normalizedAgent.startsWith(teamName + " ")
                    );
                });
            }

            const agentPhone =
                teamMember?.number
                    ? String(teamMember.number)
                    : null;

            leadsToInsert.push({
                phoneNumber: sanitizePhone(rawPhone),
                agentName,
                source: String(rawSource).trim(),
                date: String(rawDate).trim(),
                agent_phone: agentPhone,
                lastSyncedRow: 0
            });
        }

        console.log("[Cron] Prepared leads:", leadsToInsert.length);

        if (leadsToInsert.length > 0) {
            await Lead.insertMany(leadsToInsert, { ordered: false });
            console.log("[Cron] Leads inserted successfully");
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
// syncLeadsFromSheet();

const fetchAnalyticsFast = async (groupByField, startDate, endDate) => {
    const leadQuery = {
        phoneNumber: {
            $exists: true,
            $nin: ["", "SYNC_TRACKER_ROW"]
        },
        agentName: {
            $exists: true,
            $ne: "SYSTEM_TRACKER"
        },
        source: {
            $exists: true,
            $ne: "SYSTEM_TRACKER"
        }
    };

    if (startDate || endDate) {
        leadQuery.date = {};

        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);

            leadQuery.date.$gte = start;
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            leadQuery.date.$lte = end;
        }
    }

    const leads = await Lead.find(
        leadQuery,
        {
            phoneNumber: 1,
            [groupByField]: 1
        }
    ).lean();

    if (!leads.length) {
        return {
            totalLeads: 0,
            list: []
        };
    }

    const leadPhones = [
        ...new Set(
            leads
                .map((lead) => sanitizePhone(lead.phoneNumber))
                .filter(Boolean)
        )
    ];

    const matchingOrders = await Order.find(
        {
            phone_no: {
                $exists: true,
                $nin: ["", null]
            }
        },
        {
            phone_no: 1
        }
    ).lean();

    const orderPhoneSet = new Set();

    for (const order of matchingOrders) {
        const phone = sanitizePhone(order.phone_no);

        if (phone && leadPhones.includes(phone)) {
            orderPhoneSet.add(phone);
        }
    }

    const statsMap = {};
    let totalLeadsCount = 0;

    for (const lead of leads) {
        const groupName = lead[groupByField] || "Unknown";

        const cleanLeadPhone = sanitizePhone(
            lead.phoneNumber
        );

        if (!statsMap[groupName]) {
            statsMap[groupName] = {
                totalLeadsAssigned: 0,
                orderConfirmed: 0
            };
        }

        statsMap[groupName].totalLeadsAssigned += 1;
        totalLeadsCount += 1;

        if (
            cleanLeadPhone &&
            orderPhoneSet.has(cleanLeadPhone)
        ) {
            statsMap[groupName].orderConfirmed += 1;
        }
    }

    // ================= FINAL RESPONSE =================
    const resultList = Object.keys(statsMap).map((key) => {
        const total =
            statsMap[key].totalLeadsAssigned;

        const confirmed =
            statsMap[key].orderConfirmed;

        const ratio =
            total > 0
                ? ((confirmed / total) * 100).toFixed(2)
                : "0.00";

        return {
            name: key,
            totalLeadsAssigned: total,
            orderConfirmed: confirmed,
            conversionRatio: `${ratio}%`
        };
    });

    resultList.sort(
        (a, b) =>
            b.totalLeadsAssigned -
            a.totalLeadsAssigned
    );

    return {
        totalLeads: totalLeadsCount,
        list: resultList
    };
};

const fetchAgentAnalyticsFast = async (groupByField, startDate, endDate) => {

    const parseStartDate = (dateStr) => {
        if (!dateStr) return null;
        const value = String(dateStr).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const date = new Date(`${value}T00:00:00.000Z`);
        return isNaN(date.getTime()) ? null : date;
    };

    const parseEndDate = (dateStr) => {
        if (!dateStr) return null;
        const value = String(dateStr).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const date = new Date(`${value}T23:59:59.999Z`);
        return isNaN(date.getTime()) ? null : date;
    };

    const start = parseStartDate(startDate);
    const end = parseEndDate(endDate);

    if (startDate && !start) throw new Error(`Invalid startDate: ${startDate}`);
    if (endDate && !end) throw new Error(`Invalid endDate: ${endDate}`);

    const parseDDMMYYYY = (dateStr) => {
        if (!dateStr || typeof dateStr !== "string") return null;
        const parts = dateStr.trim().split("/");
        if (parts.length !== 3) return null;
        const [day, month, year] = parts.map(Number);
        if (!day || !month || !year) return null;
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    };

    const normalize = (str) => String(str || "").trim().toLowerCase().replace(/\s+/g, " ");

    // 2. Fetch Leads (Primary Source for Agents)
    const leadQuery = {
        phoneNumber: { $exists: true, $nin: ["", "SYNC_TRACKER_ROW"] },
        agentName: { $exists: true, $ne: "SYSTEM_TRACKER" },
        source: { $exists: true, $ne: "SYSTEM_TRACKER" }
    };

    let leads = await Lead.find(leadQuery, { agentName: 1, [groupByField]: 1, date: 1 }).lean();

    // In-memory Date range filter for Leads ("DD/MM/YYYY")
    if (start || end) {
        leads = leads.filter((lead) => {
            if (!lead.date) return false;
            const leadDate = parseDDMMYYYY(lead.date);
            if (!leadDate) return false;

            if (start && leadDate < start) return false;
            if (end && leadDate > end) return false;
            return true;
        });
    }

    // 3. Prepare Stats Bucket solely based on Leads Sheet
    const statsMap = {};

    for (const lead of leads) {
        const rawName = String(lead[groupByField] || "").trim() || "Unknown";
        const key = normalize(rawName);

        if (!statsMap[key]) {
            statsMap[key] = { displayName: rawName, totalLeadsAssigned: 0, orderConfirmed: 0 };
        }
        statsMap[key].totalLeadsAssigned++;
    }

    // 4. Fetch Orders
    const orderQuery = {
        order_taken_by: { $exists: true, $nin: ["", null] },
        status: 1
    };
    if (start || end) {
        orderQuery.createdAt = {};
        if (start) orderQuery.createdAt.$gte = start;
        if (end) orderQuery.createdAt.$lte = end;
    }

    const orders = await Order.find(
        orderQuery,
        {
            order_taken_by: 1,
            createdAt: 1,
            status: 1
        }
    ).lean();

    // Helper to find matching key from Sheet Agents ONLY
    const findMatchingKey = (orderAgentNorm) => {
        // Direct match
        if (statsMap[orderAgentNorm]) return orderAgentNorm;

        // Partial / Prefix / Contains match with existing sheet agents
        for (const key of Object.keys(statsMap)) {
            if (key === "unknown") continue;

            // Substring check (e.g. "parveen" vs "parveen jahan")
            if (key.includes(orderAgentNorm) || orderAgentNorm.includes(key)) {
                return key;
            }
        }
        return null; // Match nahi mila
    };

    // 5. Count Orders ONLY for agents present in statsMap (Leads Sheet)
    for (const order of orders) {
        const rawAgent = String(order.order_taken_by || "").trim();
        if (!rawAgent) continue;

        const orderAgentNorm = normalize(rawAgent);
        const matchingKey = findMatchingKey(orderAgentNorm);

        // AGAR LEADS SHEET ME BUCKET MILI TABHI MATCH KARO, WARNA IGNORE KARO
        if (matchingKey && statsMap[matchingKey]) {
            statsMap[matchingKey].orderConfirmed++;
        }
    }

    // 6. Format Response
    const list = Object.values(statsMap).map((data) => {
        const conversionRatio = data.totalLeadsAssigned > 0
            ? ((data.orderConfirmed / data.totalLeadsAssigned) * 100).toFixed(2)
            : "0.00";
        return {
            name: data.displayName,
            totalLeadsAssigned: data.totalLeadsAssigned,
            orderConfirmed: data.orderConfirmed,
            conversionRatio: `${conversionRatio}%`
        };
    });

    list.sort((a, b) => b.totalLeadsAssigned - a.totalLeadsAssigned);

    return { totalLeads: leads.length, list };
};

router.get("/agent-analytics",async (req, res) => {
        try {
            const {
                startDate,
                endDate
            } = req.query;
            const analyticsData =
                await fetchAgentAnalyticsFast(
                    "agentName",
                    startDate,
                    endDate
                );
            return res.status(200).json({
                error: false,
                message:
                    "Agent analytics fetched successfully",
                totalLeads:
                    analyticsData.totalLeads,
                data:
                    analyticsData.list
            });
        } catch (error) {
            console.error(
                "Error fetching agent analytics:",
                error
            );
            return res.status(500).json({
                error: true,
                message:
                    "Server error fetching agent analytics",
                details:
                    error.message
            });
        }
    }
);

router.get("/source-analytics", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const analyticsData = await fetchAnalyticsFast(
            "source",
            startDate,
            endDate
        );

        return res.status(200).json({
            error: false,
            message: "Source analytics fetched successfully",
            totalLeads: analyticsData.totalLeads,
            data: analyticsData.list
        });

    } catch (error) {
        console.error(
            "Error fetching source analytics:",
            error
        );

        return res.status(500).json({
            error: true,
            message: "Server error fetching source analytics",
            details: error.message
        });
    }
});


router.get('/leads', async (req, res) => {
    try {
        const { agent_phone } = req.query;

        let query = {};
        if (agent_phone) {
            query.agent_phone = agent_phone;
        }

        const leads = await Lead.find(query).lean();

        const leadsWithHistory = await Promise.all(
            leads.map(async (lead) => {
                const logs = await CallLog.find({ lead_id: lead._id })
                    .sort({ started_at: -1 })
                    .lean();

                return {
                    id: lead._id.toString(),
                    name: lead.name || lead.agentName || "",
                    phone: lead.phone || lead.phoneNumber || "",
                    status: lead.status,
                    source: lead.source,
                    call_logs: logs.map(log => ({
                        id: log._id.toString(),
                        client_call_id: log.client_call_id,
                        started_at: log.started_at,
                        duration_seconds: log.duration_seconds,
                        status: log.status,
                        direction: log.direction,
                    }))
                };
            })
        );

        return res.status(200).json({ data: leadsWithHistory });
    } catch (error) {
        console.error('Error fetching leads:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});


router.post('/call-logs', async (req, res) => {
    try {
        const {
            client_call_id,
            agent_id,
            agent_phone,
            lead_id,
            phone,
            direction,
            status,
            started_at,
            ended_at,
            duration_seconds,
            placed_from_app,
            sim
        } = req.body;

        const existingLog = await CallLog.findOne({ client_call_id });
        if (existingLog) {
            return res.status(409).json({ message: 'Call log already exists' });
        }

        const newCallLog = new CallLog({
            client_call_id,
            agent_id,
            agent_phone,
            lead_id,
            phone,
            direction,
            status,
            started_at,
            ended_at,
            duration_seconds,
            placed_from_app,
            sim
        });

        await newCallLog.save();

        return res.status(201).json({
            success: true,
            message: 'Call log saved successfully',
            data: newCallLog
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Duplicate client_call_id' });
        }
        console.error('Error saving call log:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = {
    router,
    syncLeadsFromSheet
};