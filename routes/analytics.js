const express = require("express");
const router = express.Router();
const userVisit = require("../models/user-visit");

/**
 * Track daily unique website visit
 */
router.post("/track-daily-visit", async (req, res) => {
  try {
    const { visitorId, device, os, browser, page } = req.body

    if (!visitorId) {
      return res.status(400).json({
        success: false,
        message: "visitorId is required",
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const result = await userVisit.updateOne(
      {
        visitorId,
        visitDate: startOfToday,
      },
      {
        $setOnInsert: {
    visitorId,
    visitDate: startOfToday,
    device,
    os,
    browser,
    page,
    }
      },
      { upsert: true }
    );

    // count UNIQUE users today
    const totalUniqueUsersToday = await userVisit.countDocuments({
      visitDate: startOfToday,
    });

    return res.status(200).json({
      success: true,
      message: "Data sent successfully and saved to database",
      data: {
        isNewUser: result.upsertedCount === 1,
        totalUniqueUsersToday,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save visit data",
      error: error.message,
    });
  }
});

/**
 * Flexible range API
 */
router.get("/visits/unique/range", async (req, res) => {
  try {
    const { days, date, startDate, endDate } = req.query;

    let start, end;

    if (date) {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);

      end = new Date(date);
      end.setHours(23, 59, 59, 999);
    } 
    else if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } 
    else if (days) {
      end = new Date();
      end.setHours(23, 59, 59, 999);

      start = new Date();
      start.setDate(start.getDate() - (Number(days) - 1));
      start.setHours(0, 0, 0, 0);
    } 
    else {
      return res.status(400).json({
        success: false,
        message: "Invalid date parameters",
      });
    }

    const data = await userVisit.aggregate([
      { $match: { visitDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$visitDate",
          users: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: data.map(d => ({
        date: d._id.toISOString().split("T")[0],
        users: d.users,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


module.exports = router;