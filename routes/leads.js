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


const getAgentPhone = async (agentName) => {
    if (!agentName) return "";

    const team = await Team.findOne({
        name: { $regex: `^${agentName.trim()}$`, $options: "i" }
    });

    if (!team) return "";

    return team.number || team.alternativeNumber || "";
};


async function upsertLead(filter, update) {
    const options = { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true };
    try {
        return await Lead.findOneAndUpdate(filter, update, options);
    } catch (err) {
        if (err.code === 11000) {
            // doosri request ne abhi insert kiya, ab sirf update karo
            return await Lead.findOneAndUpdate(filter, update, { ...options, upsert: false });
        }
        throw err;
    }
}

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
            const rawDate = row[3] || null;
            const raweventDate = row[4] || null;
            const rawOrderSummary = row[5] || "";
            const rawEventDetails = row[6] || "";

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

            const agentPhone = teamMember?.number
                ? sanitizePhone(teamMember.number)
            : null;

            leadsToInsert.push({
                phoneNumber: sanitizePhone(rawPhone),
                agentName,
                source: String(rawSource).trim(),
                date: String(rawDate).trim(),
                eventDate: String(raweventDate).trim(),
                orderSummary: String(rawOrderSummary).trim(),
                eventDetails: String(rawEventDetails).trim(),
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


const fetchAnalyticsFast = async (groupByField, startDate, endDate, source) => {
    const normalize = (value) =>
        String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");

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

    const parseDDMMYYYY = (dateStr) => {
        if (!dateStr) return null;

        const parts = String(dateStr).trim().split("/");
        if (parts.length !== 3) return null;

        const [day, month, year] = parts.map(Number);

        if (!day || !month || !year) return null;

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCDate() !== day ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCFullYear() !== year
        ) {
            return null;
        }

        return date;
    };

    const start = parseStartDate(startDate);
    const end = parseEndDate(endDate);

    if (startDate && !start) {
        throw new Error(`Invalid startDate: ${startDate}`);
    }

    if (endDate && !end) {
        throw new Error(`Invalid endDate: ${endDate}`);
    }

    if (start && end && start > end) {
        throw new Error("startDate cannot be after endDate");
    }

    // 1. Build Lead query
    const leadQuery = {
        phoneNumber: {
            $exists: true,
            $nin: ["", "SYNC_TRACKER_ROW"]
        },
        agentName: {
            $ne: "SYSTEM_TRACKER"
        },
        source: {
            $ne: "SYSTEM_TRACKER"
        }
    };

    // 2. Filter selected sources
    if (source && groupByField === "source") {
        const selectedSources = (
            Array.isArray(source) ? source : [source]
        )
            .flatMap((item) => String(item).split(","))
            .map((item) => item.trim())
            .filter(Boolean);

        if (selectedSources.length === 1) {
            leadQuery.source = selectedSources[0];
        } else if (selectedSources.length > 1) {
            leadQuery.source = { $in: selectedSources };
        }
    }

    // 3. Fetch leads
    let leads = await Lead.find(
        leadQuery,
        {
            agentName: 1,
            [groupByField]: 1,
            date: 1,
            phoneNumber: 1,
            eventDate: 1,
            eventDetails: 1,
            orderSummary: 1
        }
    ).lean();

    // 4. Filter leads by Google Sheet date
    if (start || end) {
        leads = leads.filter((lead) => {
            const leadDate = parseDDMMYYYY(lead.date);

            if (!leadDate) return false;
            if (start && leadDate < start) return false;
            if (end && leadDate > end) return false;

            return true;
        });
    }

    const statsMap = {};
    let totalLeadsCount = 0;

    const normalizePhone = (phone) => {
        if (!phone) return "";

        const cleaned = String(phone).replace(/\D/g, "");

        if (cleaned.length === 12 && cleaned.startsWith("91")) {
            return cleaned.slice(2);
        }

        return cleaned;
    };

    const phoneSources = new Map();

    for (const lead of leads) {
        const groupName = String(
            lead[groupByField] || "Unknown"
        ).trim();

        const sourceKey = normalize(groupName);
        const phone = normalizePhone(lead.phoneNumber);

        if (!statsMap[sourceKey]) {
            statsMap[sourceKey] = {
                name: groupName,
                totalLeadsAssigned: 0,
                orderConfirmed: 0,
                eventDateCount: 0,
                eventDetailsCount: 0,
                orderSummaryCount: 0
            };
        }

        statsMap[sourceKey].totalLeadsAssigned++;
        totalLeadsCount++;


        const hasValue = (value) => {
            const normalizedValue = String(value ?? "").trim();

            return normalizedValue !== "" &&
                normalizedValue.toUpperCase() !== "#N/A";
        };

        if (hasValue(lead.eventDate)) {
            statsMap[sourceKey].eventDateCount++;
        }

        if (hasValue(lead.eventDetails)) {
            statsMap[sourceKey].eventDetailsCount++;
        }

        if (hasValue(lead.orderSummary)) {
            statsMap[sourceKey].orderSummaryCount++;
        }

        if (phone) {
            if (!phoneSources.has(phone)) {
                phoneSources.set(phone, new Set());
            }

            phoneSources.get(phone).add(sourceKey);
        }
    }

    if (!leads.length) {
        return {
            totalLeads: 0,
            list: []
        };
    }

    // 6. Fetch confirmed orders by status
    const orderQuery = {
        phone_no: {
            $exists: true,
            $nin: ["", null]
        },
        status: 1
    };

    if (start || end) {
        orderQuery.createdAt = {};

        if (start) orderQuery.createdAt.$gte = start;
        if (end) orderQuery.createdAt.$lte = end;
    }

    const matchingOrders = await Order.find(
        orderQuery,
        {
            phone_no: 1,
            createdAt: 1
        }
    ).lean();

    // 7. Match orders using phone number
    for (const order of matchingOrders) {
        const phone = normalizePhone(order.phone_no);

        if (!phone) continue;

        const matchedSources = phoneSources.get(phone);

        if (!matchedSources) continue;

        for (const sourceKey of matchedSources) {
            if (statsMap[sourceKey]) {
                statsMap[sourceKey].orderConfirmed++;
            }
        }
    }

    // 8. Prepare final response
    const resultList = Object.keys(statsMap).map((key) => {
        const item = statsMap[key];
        const total = item.totalLeadsAssigned;
        const confirmed = item.orderConfirmed;

        const ratio = total > 0
            ? ((confirmed / total) * 100).toFixed(2)
            : "0.00";

        return {
            name: item.name,
            totalLeadsAssigned: total,
            orderConfirmed: confirmed,
            eventDateCount: item.eventDateCount,
            eventDetailsCount: item.eventDetailsCount,
            orderSummaryCount: item.orderSummaryCount,
            conversionRatio: `${ratio}%`
        };
    });

    resultList.sort(
        (a, b) => b.totalLeadsAssigned - a.totalLeadsAssigned
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

    let leads = await Lead.find(leadQuery, {
        agentName: 1, [groupByField]: 1, date: 1, eventDetails: 1, orderSummary: 1, eventDate: 1 }).lean();

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
            statsMap[key] = {
                displayName: rawName, totalLeadsAssigned: 0, orderConfirmed: 0, eventDetailsCount: 0, orderSummaryCount: 0, eventDateCount: 0 };
        }
        statsMap[key].totalLeadsAssigned++;


        if (
            lead.eventDetails != null &&
            String(lead.eventDetails).trim() !== "" &&
            String(lead.eventDetails).trim() !== "#N/A"
        ) {
            statsMap[key].eventDetailsCount++;
        }

        if (
            lead.orderSummary != null &&
            String(lead.orderSummary).trim() !== "" &&
            String(lead.orderSummary).trim() !== "#N/A"
        ) {
            statsMap[key].orderSummaryCount++;
        }

        if (
            lead.eventDate != null &&
            String(lead.eventDate).trim() !== "" &&
            String(lead.eventDate).trim() !== "#N/A"
        ) {
            statsMap[key].eventDateCount++;
        }
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
            eventDetailsCount: data.eventDetailsCount,
            orderSummaryCount: data.orderSummaryCount,
            conversionRatio: `${conversionRatio}%`,
            eventDateCount: data.eventDateCount,
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
        const { startDate, endDate, sources, source } = req.query;


        const selectedSources = sources || source;



        const analyticsData = await fetchAnalyticsFast(
            "source",
            startDate,
            endDate,
            selectedSources,
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

router.get("/admin-leads", async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            name = "",
            phoneNumber = "",
            source = "",
            sources = "",
            startDate,
            endDate,
            startEventDate,
            endEventDate
        } = req.query;

        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (currentPage - 1) * pageLimit;

        const escapeRegex = (value) =>
            String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const query = {
            phoneNumber: {
                $exists: true,
                $nin: ["", "SYNC_TRACKER_ROW"]
            },
            agentName: {
                $ne: "SYSTEM_TRACKER"
            },
            source: {
                $ne: "SYSTEM_TRACKER"
            }
        };

        if (String(name).trim()) {
            query.agentName = {
                $regex: escapeRegex(name),
                $options: "i"
            };
        }

        if (String(phoneNumber).trim()) {
            query.phoneNumber = {
                $exists: true,
                $nin: ["", "SYNC_TRACKER_ROW"],
                $regex: escapeRegex(phoneNumber),
                $options: "i"
            };
        }

        if (String(sources).trim()) {
            const selectedSourceList = String(sources)
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

            if (selectedSourceList.length > 0) {
                query.source = {
                    $nin: ["SYSTEM_TRACKER"],
                    $in: selectedSourceList.map(
                        (item) => new RegExp(
                            `^${escapeRegex(item)}$`,
                            "i"
                        )
                    )
                };
            }
        } else if (String(source).trim()) {
            query.source = {
                $ne: "SYSTEM_TRACKER",
                $regex: escapeRegex(source),
                $options: "i"
            };
        }

        const parseDate = (value, endOfDay = false) => {
            if (!value) return null;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return undefined;
            }

            const date = new Date(
                `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
            );

            if (
                isNaN(date.getTime()) ||
                date.toISOString().slice(0, 10) !== value
            ) {
                return undefined;
            }

            return date;
        };

        const start = parseDate(startDate);
        const end = parseDate(endDate, true);
        const eventStart = parseDate(startEventDate);
        const eventEnd = parseDate(endEventDate, true);

        if (
            start === undefined ||
            end === undefined ||
            eventStart === undefined ||
            eventEnd === undefined
        ) {
            return res.status(400).json({
                error: true,
                message: "Invalid date. Use YYYY-MM-DD."
            });
        }

        if (start && end && start > end) {
            return res.status(400).json({
                error: true,
                message: "startDate cannot be after endDate."
            });
        }

        if (eventStart && eventEnd && eventStart > eventEnd) {
            return res.status(400).json({
                error: true,
                message: "startEventDate cannot be after endEventDate."
            });
        }

        const pipeline = [
            { $match: query }
        ];

        // Convert date strings from DD/MM/YYYY into MongoDB dates
        if (start || end || eventStart || eventEnd) {
            pipeline.push({
                $addFields: {
                    parsedLeadDate: {
                        $dateFromString: {
                            dateString: "$date",
                            format: "%d/%m/%Y",
                            onError: null,
                            onNull: null
                        }
                    },
                    parsedEventDate: {
                        $dateFromString: {
                            dateString: "$eventDate",
                            format: "%d/%m/%Y",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            });

            const dateConditions = {};

            if (start || end) {
                dateConditions.parsedLeadDate = {};

                if (start) dateConditions.parsedLeadDate.$gte = start;
                if (end) dateConditions.parsedLeadDate.$lte = end;
            }

            if (eventStart || eventEnd) {
                dateConditions.parsedEventDate = {};

                if (eventStart) {
                    dateConditions.parsedEventDate.$gte = eventStart;
                }

                if (eventEnd) {
                    dateConditions.parsedEventDate.$lte = eventEnd;
                }
            }

            pipeline.push({
                $match: dateConditions
            });
        }

        // Pagination and count
        pipeline.push({
            $facet: {
                data: [
                    { $sort: { _id: -1 } },
                    { $skip: skip },
                    { $limit: pageLimit },
                    {
                        $project: {
                            phoneNumber: 1,
                            agentName: 1,
                            source: 1,
                            date: 1,
                            eventDate: 1,
                            orderSummary: 1,
                            eventDetails:1,
                        }
                    }
                ],
                total: [
                    { $count: "count" }
                ]
            }
        });

        const [result] = await Lead.aggregate(pipeline);

        const leads = result?.data || [];
        const totalRecords = result?.total?.[0]?.count || 0;

        const sanitizePhone = (phone) => {
            const cleaned = String(phone || "").replace(/\D/g, "");
            return cleaned.length >= 10
                ? cleaned.slice(-10)
                : cleaned;
        };

        const leadPhones = [
            ...new Set(
                leads
                    .map((lead) => sanitizePhone(lead.phoneNumber))
                    .filter(Boolean)
            )
        ];

        const orderedPhones = new Set();

        if (leadPhones.length > 0) {
            const leadPhoneSet = new Set(leadPhones);

            const matchingOrders = await Order.find({
                status: 1,
                phone_no: {
                    $exists: true,
                    $nin: ["", null]
                }
            })
                .select("phone_no")
                .lean();

            for (const order of matchingOrders) {
                const orderPhone = sanitizePhone(order.phone_no);

                if (orderPhone && leadPhoneSet.has(orderPhone)) {
                    orderedPhones.add(orderPhone);
                }
            }
        }

        const data = leads.map((lead) => {
            const phone = sanitizePhone(lead.phoneNumber);

            return {
                ...lead,
                orderStatus:
                    phone && orderedPhones.has(phone) ? "Yes" : "No"
            };
        });

        const totalPages = Math.ceil(totalRecords / pageLimit);

        return res.status(200).json({
            error: false,
            message: "Leads fetched successfully",
            pagination: {
                currentPage,
                limit: pageLimit,
                totalRecords,
                totalPages,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            },
            data
        });
    } catch (error) {
        console.error("Error fetching leads:", error);
        

        return res.status(500).json({
            error: true,
            message: "Server error fetching leads",
            details: error.message
        });
    }
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/leads', async (req, res) => {
    try {
        const agentName = req.query.agent_name || req.query.agentName;
        const search = (req.query.search || '').toString().trim().slice(0, 50);

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        const and = [
            {
                $or: [
                    { phone: { $nin: [null, ''] } },
                    { phoneNumber: { $nin: [null, ''] } },
                ]
            },
        ];

        if (agentName && agentName !== 'null' && agentName !== 'undefined') {
            and.push({
                agentName: {
                    $regex: `^${escapeRegex(agentName.trim())}$`,
                    $options: 'i',
                },
            });
        }

        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            const or = [{ name: rx }, { agentName: rx }];

            const digits = search.replace(/\D/g, '');
            if (digits.length >= 3) {
                const drx = new RegExp(digits.split('').join('\\D*'));
                or.push({ phone: drx }, { phoneNumber: drx });
            }
            and.push({ $or: or });
        }

        const query = { $and: and };

        const [totalLeads, leads] = await Promise.all([
            Lead.countDocuments(query),
            Lead.find(query)
                .sort({ date: -1, _id: -1 })   
                .skip(skip)
                .limit(limit)
                .select('name agentName phone phoneNumber status source agent_phone date')
                .lean(),
        ]);

        const leadIds = leads.map((l) => l._id);

        const allLogs = leadIds.length
            ? await CallLog.find({ lead_id: { $in: leadIds } })
                .select('lead_id client_call_id started_at duration_seconds status direction')
                .sort({ started_at: -1 })
                .lean()
            : [];

        const logsByLead = {};
        for (const log of allLogs) {
            const key = log.lead_id.toString();
            (logsByLead[key] ||= []).push(log);
        }

        const data = leads.map((lead) => ({
            id: lead._id.toString(),
            name: lead.name || lead.agentName || '',
            phone: lead.phone || lead.phoneNumber || '',
            status: lead.status,
            source: lead.source,
            date: lead.date,
            agent_phone: lead.agent_phone,
            agentName: lead.agentName || '',
            call_logs: (logsByLead[lead._id.toString()] || []).map((log) => ({
                id: log._id.toString(),
                client_call_id: log.client_call_id,
                started_at: log.started_at,
                duration_seconds: log.duration_seconds,
                status: log.status,
                direction: log.direction,
            })),
        }));

        const totalPages = Math.ceil(totalLeads / limit);

        res.set('Cache-Control', 'no-store');
        return res.status(200).json({
            data,
            pagination: {
                currentPage: page,
                perPage: limit,
                totalItems: totalLeads,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
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


router.get('/agents', async (req, res) => {
    try {
        const rows = await Lead.aggregate([
            {
                $match: {
                    agentName: { $nin: [null, ''] },
                },
            },
            {
                $addFields: {
                    normalizedName: {
                        $toLower: {
                            $trim: { input: '$agentName' },
                        },
                    },
                },
            },
            {
                $group: {
                    _id: '$normalizedName',
                    name: { $first: { $trim: { input: '$agentName' } } },
                },
            },
            { $sort: { name: 1 } },
        ]);
        return res.status(200).json({
            data: rows.map((r) => ({
                name: r.name,
            })),
        });
    } catch (error) {
        console.error('Error fetching agents:', error);
        return res.status(500).json({
            message: 'Internal server error',
        });
    }
});


router.get("/unique-sources", async (req, res) => {
    try {
        const sources = await Lead.aggregate([
            {
                $match: {
                    source: { $exists: true, $ne: null, $ne: "" },
                },
            },
            {
                $group: {
                    _id: { $trim: { input: "$source" } },
                },
            },
            {
                $match: {
                    _id: { $ne: "" },
                },
            },
            {
                $sort: { _id: 1 },
            },
            {
                $project: {
                    _id: 0,
                    name: "$_id",
                },
            },
        ]);

        return res.status(200).json({
            error: false,
            data: sources,
        });
    } catch (error) {
        console.error("Unique sources error:", error);
        return res.status(500).json({
            error: true,
            message: "Failed to fetch unique sources",
        });
    }
});

router.get("/reports/dashboard", async (req, res) => {
    try {
        const { from, to } = req.query;

        const getDayTimestamp = (value) => {
            if (!value) return null;
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
            if (!m) return null;

            const year = Number(m[1]);
            const month = Number(m[2]);
            const day = Number(m[3]);

            const ts = Date.UTC(year, month - 1, day);
            const d = new Date(ts);

            if (
                d.getUTCFullYear() !== year ||
                d.getUTCMonth() !== month - 1 ||
                d.getUTCDate() !== day
            ) {
                return null;
            }
            return ts;
        };

        const parseLeadDate = (value) => {
            if (!value) return null;
            const parts = String(value).trim().split("/");
            if (parts.length !== 3) return null;

            const [day, month, year] = parts.map(Number);
            if (!day || !month || !year) return null;

            const ts = Date.UTC(year, month - 1, day);
            const d = new Date(ts);

            if (
                d.getUTCDate() !== day ||
                d.getUTCMonth() !== month - 1 ||
                d.getUTCFullYear() !== year
            ) {
                return null;
            }
            return ts;
        };

        const normalizePhone = (value) =>
            String(value || "").replace(/\D/g, "").slice(-10);

        // ---------- validate dates ----------
        const fromTs = from ? getDayTimestamp(from) : null;
        const toTs = to ? getDayTimestamp(to) : null;

        if (from && fromTs === null) {
            return res.status(400).json({
                success: false,
                message: "Invalid from date. Use YYYY-MM-DD.",
            });
        }
        if (to && toTs === null) {
            return res.status(400).json({
                success: false,
                message: "Invalid to date. Use YYYY-MM-DD.",
            });
        }
        if (fromTs !== null && toTs !== null && fromTs > toTs) {
            return res.status(400).json({
                success: false,
                message: "'from' date cannot be after 'to' date.",
            });
        }

        const start = fromTs !== null ? fromTs : -Infinity;
        const end = toTs !== null ? toTs + 24 * 60 * 60 * 1000 - 1 : Infinity;

        const [teams, allLeads] = await Promise.all([
            Team.find().lean(),
            Lead.find(
                {
                    phoneNumber: { $exists: true, $nin: ["", "SYNC_TRACKER_ROW"] },
                    agentName: { $ne: "SYSTEM_TRACKER" },
                    source: { $ne: "SYSTEM_TRACKER" },
                },
                {
                    phoneNumber: 1,
                    agentName: 1,
                    agent_phone: 1,
                    source: 1,
                    date: 1,
                    eventDate: 1,
                    orderSummary: 1,
                    eventDetails: 1,
                    createdAt: 1,
                }
            ).lean(),
        ]);

        const leads = allLeads.filter((lead) => {
            if (!from && !to) return true;

            const ts = parseLeadDate(lead.date);
            if (ts === null) return false;
            if (ts < start) return false;
            if (ts > end) return false;
            return true;
        });

        const teamByPhone = new Map();
        teams.forEach((t) => {
            const p = normalizePhone(t.number);
            if (p) teamByPhone.set(p, t);
        });

        const leadIds = leads.map((l) => l._id);

        const callLogs = leadIds.length
            ? await CallLog.find({ lead_id: { $in: leadIds } }).lean()
            : [];

        const callsByLead = new Map();
        callLogs.forEach((call) => {
            const key = String(call.lead_id);
            if (!callsByLead.has(key)) callsByLead.set(key, []);
            callsByLead.get(key).push(call);
        });

        const leadPhoneSet = new Set(
            leads.map((l) => normalizePhone(l.phoneNumber)).filter(Boolean)
        );

        const convertedPhones = new Set();

        if (leadPhoneSet.size > 0) {
            const orders = await Order.find({
                status: 1,
                phone_no: { $exists: true, $nin: ["", null] },
            })
                .select("phone_no")
                .lean();

            for (const o of orders) {
                const p = normalizePhone(o.phone_no);
                if (p && leadPhoneSet.has(p)) convertedPhones.add(p);
            }
        }

        const data = leads.map((lead) => {
            const phone = normalizePhone(lead.phoneNumber);
            const leadAgent = teamByPhone.get(normalizePhone(lead.agent_phone));

            const ts = parseLeadDate(lead.date);
            const createdAt = ts !== null
                ? new Date(ts).toISOString()
                : lead.createdAt
                    ? new Date(lead.createdAt).toISOString()
                    : undefined;

            const leadCalls = callsByLead.get(String(lead._id)) || [];

            return {
                id: String(lead._id),
                name: lead.phoneNumber || "Unknown", 
                phone: lead.phoneNumber || "",
                source: lead.source || "Unknown",
                status: convertedPhones.has(phone) ? "Converted" : "",
                created_at: createdAt,
                lead_date: lead.date || "",

                assigned_agent_id: leadAgent ? String(leadAgent._id) : undefined,
                assigned_agent_name: leadAgent?.name || lead.agentName || undefined,

                event_date: lead.eventDate || "",
                order_summary: lead.orderSummary || "",
                event_details: lead.eventDetails || "",

                call_logs: leadCalls.map((c) => {
                    const callAgent = teamByPhone.get(normalizePhone(c.agent_phone));

                    return {
                        id: String(c._id),
                        client_call_id: c.client_call_id,
                        agent_id: callAgent ? String(callAgent._id) : c.agent_id,
                        agent_name: callAgent?.name,
                        started_at: c.started_at,
                        ended_at: c.ended_at,
                        duration_seconds: c.duration_seconds,
                        status: c.status,
                        direction: c.direction,
                        placed_from_app: c.placed_from_app,
                    };
                }),
            };
        });

        const agents = teams.map((t) => ({
            id: String(t._id),
            name: t.name,
            phone: String(t.number || ""),
        }));

        return res.status(200).json({
            success: true,
            total: data.length,
            agents,
            data,
        });
    } catch (error) {
        console.error("Reports dashboard API error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard reports.",
            error: error.message,
        });
    }
});






// 1. ADD / CREATE LEAD API
router.post('/upsert-customer-lead', async (req, res) => {
    try {
        const {
            "customerNumber": customerPhone,
            "agentName": agentName,
            "source": source,
            "customerCreatedDate": customerCreatedDate
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "Customer Phone no. is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);

        const agentPhone = sanitizePhone(await getAgentPhone(agentName));

        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    agentName: agentName,
                    source: source,
                    date: customerCreatedDate,
                    agent_phone: agentPhone,
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Lead processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post('/upsert-order-summary', async (req, res) => {
    try {
        const {
            "customerNumber": customerPhone,
            "orderSummaryStatus": orderSummaryStatus
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "Customer Phone no. is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);

        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    orderSummary: orderSummaryStatus
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Order summary status processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post('/upsert-event-agent-details', async (req, res) => {
    try {
        const {
            customerPhone,
            eventDate,
            agentNo,
            customerCreatedDate
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "customerPhone is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);
        const sanitizedAgentPhone = sanitizePhone(agentNo);

        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    eventDate: eventDate,
                    agent_phone: sanitizedAgentPhone,
                    date: customerCreatedDate
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Details processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post('/upsert-order-details', async (req, res) => {
    try {
        const {
            customerPhone,
            orderDetails
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "customerPhone is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);

        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    eventDetails: orderDetails
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Order details processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post('/upsert-source-date', async (req, res) => {
    try {
        const {
            customerPhone,
            source,
            customerCreatedDate
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "customerPhone is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);

        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    source: source,
                    date: customerCreatedDate
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Source and date processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/upsert-source-date-funnel', async (req, res) => {
    try {
        const {
            customerPhone,
            source,
            customerCreatedDate,
            funnelStage
        } = req.body;

        if (!customerPhone) {
            return res.status(400).json({ success: false, message: "customerPhone is required" });
        }

        const sanitizedPhone = sanitizePhone(customerPhone);


        const lead = await upsertLead(
            { phoneNumber: sanitizedPhone },
            {
                $set: {
                    phoneNumber: sanitizedPhone,
                    source: source,
                    date: customerCreatedDate,
                    funnelStage: funnelStage
                }
            }
        );

        res.status(200).json({
            success: true,
            message: "Source, date and funnel stage processed successfully (Updated if existed, Created if new)",
            data: lead
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


module.exports = {
    router,
    syncLeadsFromSheet
};