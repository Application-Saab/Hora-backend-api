const express = require("express");
const Folder = require("../models/folder");
const router = express.Router();

router.get("/:shortCode", async (req, res) => {
    try {
        const { shortCode } = req.params;

        const folder = await Folder.findOne({ shortCode }).lean();

        const actualGalleryUrl = `https://horaservices.com/weblink-gallery?folderName=${encodeURIComponent(folder.folderName)}&customerId=${folder.customerId}`;

        return res.redirect(actualGalleryUrl);

    } catch (err) {
        console.error("Error in redirection:", err);
        return res.status(500).send("Internal Server Error");
    }
});

module.exports = router;