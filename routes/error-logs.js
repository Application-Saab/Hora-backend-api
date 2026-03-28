const express = require("express");
const router = express.Router();
const ErrorLogs = require("../models/errorLogs");

// ✅ POST: Track error (increment count)
router.post("/track-error", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: true,
        message: "URL is required",
      });
    }

    await ErrorLogs.updateOne(
      { url },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    return res.json({
      error: false,
      message: "Error count updated",
    });

  } catch (err) {
    console.error("Track error failed:", err);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
});


// ✅ GET: Total error count (whole website)
router.get("/total-errors", async (req, res) => {
  try {
    const result = await ErrorLogs.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
        },
      },
    ]);

    res.json({
      total: result[0]?.total || 0,
    });

  } catch (err) {
    res.status(500).json({ error: true });
  }
});


// ✅ GET: Errors per page
router.get("/errors-by-page", async (req, res) => {
  try {
    const data = await ErrorLogs.find().sort({ count: -1 });

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: true });
  }
});


// ✅ GET: Single page error count
router.get("/error-count", async (req, res) => {
  try {
    const { url } = req.query;

    const data = await ErrorLogs.findOne({ url });

    res.json({
      url,
      count: data?.count || 0,
    });

  } catch (err) {
    res.status(500).json({ error: true });
  }
});

module.exports = router;