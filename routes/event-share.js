const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const generateUniqueShortCode = require("../utils/generateUniqueShortCode");
const EventInvite = require("../models/event-invite");
const { CustomResponse } = require("../store/commonFunction");

// fetch shorten urls after sharing
router.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const event = await EventInvite.findOne({
      shortCode,
    }).select("_id, fromInternational");

    if (!event) {
      return res.redirect("https://horaservices.com/wonderland");
    }

    let shareUrl = `https://horaservices.com/${event?.fromInternational === "YES" ? "wonderlandinternational" : "wonderland"}/invite?eventid=${event._id}`;

    return res.redirect(shareUrl);
  } catch (err) {
    console.log(err);

    return res.status(500).send("Internal Server Error");
  }
});

router.post("/generate-share-code/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { fromInternational } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return CustomResponse(res, 400, true, "Invalid event ID");
    }

    const event = await EventInvite.findById(eventId);

    if (!event) {
      return CustomResponse(res, 404, true, "Event not found");
    }

    // already exists
    if (event.shortCode) {
      return CustomResponse(res, 200, false, "Short code already exists", {
        shortCode: event.shortCode,

        shortUrl: `https://horaservices.com/smartinvite/share/${event.shortCode}`,
      });
    }

    // generate new
    const shortCode = await generateUniqueShortCode();

    event.shortCode = shortCode;

    if (fromInternational !== "" && !event.fromInternational) {
      event.fromInternational = fromInternational;
    }

    await event.save();

    return CustomResponse(
      res,
      200,
      false,
      "Short code generated successfully",
      {
        shortCode,

        shortUrl: `https://horaservices.com/smartinvite/share/${shortCode}`,
      },
    );
  } catch (err) {
    console.log(err);

    return CustomResponse(res, 500, true, "Server error");
  }
});

module.exports = router;
