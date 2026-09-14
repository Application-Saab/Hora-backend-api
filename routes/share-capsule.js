const express = require("express");
const Folder = require("../models/folder");
const Order = require("../models/order");
const router = express.Router();

router.get("/:shortCode", async (req, res, next) => {
    try {
        const { shortCode } = req.params;
        const { fromPanel } = req.query;

        const folder = await Folder.findOne({ shortCode }).lean();

        if (!folder) {
            return res.status(404).json({
                message: "Folder not found",
            });
        }

        if (!folder.orderId) {
            return res.status(404).json({
                message: "Order ID not found in folder",
            });
        }

        const orderId = Number(folder.orderId);

        if (Number.isNaN(orderId)) {
            return res.status(400).json({
                message: "Invalid order ID in folder",
            });
        }

        const order = await Order.findOne({
            order_id: orderId,
        }).lean();

        if (!order) {
            return res.status(404).json({
                message: "Order not found",
            });
        }

        if (!order.orderWebLink) {
            return res.status(404).json({
                message: "Order web link not found",
            });
        }

        let redirectUrl = order.orderWebLink;

        if (fromPanel === "true") {
            redirectUrl += redirectUrl.includes("?")
                ? "&fromPanel=true"
                : "?fromPanel=true";
        }

        return res.redirect(redirectUrl);

    } catch (err) {
        console.error("Error in redirection:", err);
        err.isPublic = true;
        next(err);
    }
});

module.exports = router;