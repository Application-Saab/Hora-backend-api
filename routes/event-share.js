const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const generateUniqueShortCode = require("../utils/generateUniqueShortCode");
const EventInvite = require("../models/event-invite");
const { CustomResponse } = require("../store/commonFunction");

function formateDateInDMDFormat(dateInput) {
  if (!dateInput) return "";

  const date = new Date(dateInput);

  const dayName = date.toLocaleDateString("en-IN", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  });

  const monthName = date.toLocaleDateString("en-IN", {
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  const day = Number(
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      timeZone: "Asia/Kolkata",
    }),
  );

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  return `${dayName}, ${monthName} ${day}${getOrdinal(day)}`;
}

// fetch shorten urls after sharing
router.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const event = await EventInvite.findOne({ shortCode }).lean();

    if (!event) {
      return res.redirect("https://horaservices.com/wonderland");
    }

    // Format title dynamically based on hostName presence
    const eventTitle = event.hostName
      ? `You're invited to ${event.hostName}! 🎉`
      : "You're invited! 🎉";

    // Dynamic Date formatting
    let formattedDate = "";
    if (event.eventDate) {
      try {
        const d = new Date(event.eventDate);
        // If valid then format
        if (!isNaN(d.getTime())) {
          formattedDate = formateDateInDMDFormat(d);
        }
      } catch (dateErr) {
        console.log("Date parsing failed, using raw data if string:", dateErr);
      }
    }

    // Append only valid string and icons
    const descParts = [];

    if (formattedDate) {
      descParts.push(`📅 ${formattedDate}`);
    }
    if (event.eventTime) {
      descParts.push(`⏰ ${event.eventTime}`);
    }
    if (
      event.location &&
      event.location.trim() !== "" &&
      event.location.toLowerCase() !== undefined
    ) {
      descParts.push(`📍 ${event.location}`);
    } else if (event.location && event.location.trim() !== "") {
      descParts.push(`📍 ${event.location}`);
    }

    const eventDesc =
      descParts.length > 0
        ? descParts.join(" | ")
        : "Tap to view the full invitation details on Wonderland.";

    // Preview Image Logic
    let previewImage =
      "https://horaservices.com/api/uploads/templates/1778259950896-smalltemplate_1.jpg"; // default image
    if (event.externalTemplateImageUrl) {
      previewImage = event.externalTemplateImageUrl;
    }

    // 6. Check for Crawler/Bot
    const userAgent = req.headers["user-agent"] || "";
    const isBot =
      /WhatsApp|facebookexternalhit|Twitterbot|LinkedInBot|TelegramBot/i.test(
        userAgent,
      );

    let shareUrl = `https://horaservices.com/${
      event?.fromInternational === "YES"
        ? "wonderlandinternational"
        : "wonderland"
    }/invite?eventid=${event._id}`;

    if (isBot) {
      // Content-Length auto handle
      const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <meta property="og:site_name" content="HORA Services" />
    <meta property="og:title" content="${eventTitle}" />
    <meta property="og:description" content="${eventDesc}" />
    <meta property="og:image" content="${previewImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="400" />
    <meta property="og:image:height" content="400" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://horaservices.com/smartinvite/share/${shortCode}" />
    
    <title>${eventTitle}</title>
</head>
<body>
    <p>Redirecting to invitation... If not redirected, <a href="${shareUrl}">click here</a>.</p>
    <script>
        window.location.href = "${shareUrl}";
    </script>
</body>
</html>`;

      res.set({
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=300",
      });

      return res.status(200).send(htmlResponse);
    }

    // Normal user direct redirection
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
