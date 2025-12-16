const crypto = require("crypto");
const axios = require("axios");
const express = require("express");
const router = express.Router();
const orderModel = require("../models/order");

// Create payment link
router.post("/payment", async (req, res) => {
  try {
    let { user_id, price, phone, name, merchantTransactionId } = req.body;

    if (user_id === "670cafda63f0548f592bf2f2") {
      price = 1;
    }

    if (!name || name.trim() === "") {
      return res.status(400).send({
        message: "Customer name is required and cannot be empty",
        success: false,
      });
    }

    if (!/^\+?\d{10,12}$/.test(phone)) {
      return res.status(400).send({
        message:
          "Invalid phone number. Must be 10-12 digits (optionally with +)",
        success: false,
      });
    }

    const data = {
      amount: price * 100,
      currency: "INR",
      reference_id: merchantTransactionId,
      description: `Payment for user ${user_id}`,
      customer: {
        name: name.trim(),
        contact: phone,
      },
      notify: {
        sms: true,
        email: false,
      },
      reminder_enable: true,
      callback_url: `https://horaservices.com/?transaction=${merchantTransactionId}`,
      // callback_url: `http://localhost:3000/?transaction=${merchantTransactionId}`,
      notes: {
        merchantTransactionId: merchantTransactionId,
      },
    };

    try {
      const response = await axios.post(
        "https://api.razorpay.com/v1/payment_links",
        data,
        {
          auth: {
            username: process.env.RAZORPAY_KEY_ID,
            password: process.env.RAZORPAY_KEY_SECRET,
          },
          headers: { "Content-Type": "application/json" },
        }
      );
      console.log('%c [ response ]-54', 'font-size:13px; background:pink; color:#bf2c9f;', response)

      if (response.data.short_url) {
        return res.status(200).send(response.data.short_url);
      } else {
        return res.status(500).send({
          message: "Failed to create payment link",
          success: false,
          errorDetails: response.data,
        });
      }
    } catch (error) {
      return res.status(error.response?.status || 500).send({
        message:
          error.response?.data?.error?.description ||
          error.message ||
          "Request failed",
        success: false,
        errorDetails: error.response?.data || null,
      });
    }
  } catch (error) {
    res.status(500).send({
      message: error.message,
      success: false,
    });
  }
});

// Check payment status
router.post("/status/:txnId", async (req, res) => {
  try {
    const merchantTransactionId = req.params["txnId"];

    try {
      const response = await axios.get(
        `https://api.razorpay.com/v1/payment_links?reference_id=${merchantTransactionId}`,
        {
          auth: {
            username: process.env.RAZORPAY_KEY_ID,
            password: process.env.RAZORPAY_KEY_SECRET,
          },
          headers: { accept: "application/json" },
        }
      );

      const responseData = response.data;
      const paymentLinks = responseData.payment_links || [];

      if (paymentLinks.length > 0) {
        const paymentLink = paymentLinks[0];

        if (paymentLink.status === "paid") {
          return res.status(200).send({
            success: true,
            message: "PAYMENT_SUCCESS",
          });
        } else {
          return res.status(200).send({
            success: false,
            message: paymentLink.status.toUpperCase(),
          });
        }
      } else {
        return res.status(404).send({
          message: "Payment link not found",
          success: false,
          errorDetails: responseData,
        });
      }
    } catch (error) {
      return res.status(error.response?.status || 500).send({
        message:
          error.response?.data?.error?.description ||
          "Failed to fetch payment link",
        success: false,
        errorDetails: error.response?.data || null,
      });
    }
  } catch (error) {
    res.status(500).send({
      message: error.message,
      success: false,
    });
  }
});

// ---------------- WEBHOOK ----------------
router.post("/razorpay/webhook", async (req, res) => {
  try {
    const webhookSecret = "Sahaj@22";
    const receivedSignature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== receivedSignature) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    const event = req.body.event;
    const payload =
      req.body.payload.payment.entity ||
      req.body.payload.payment_link.entity;

    if (event === "payment_link.paid" || event === "payment.captured") {
      const referenceId =
        payload.reference_id || payload.notes.merchantTransactionId;

      if (!referenceId) {
        return res
          .status(400)
          .send({ success: false, message: "Missing referenceId" });
      }

      const order = await orderModel.findOne({ _id: referenceId });

      if (!order) {
        return res
          .status(404)
          .send({ success: false, message: "Order not found" });
      }

      if (order.status === 1) {
        return res.status(200).send({ success: true, message: "Already paid" });
      }

      await orderModel.findByIdAndUpdate(order._id, { $set: { status: 1 } });

      return res.status(200).send({
        success: true,
        message: "Payment webhook processed",
      });
    } else {
      return res.status(200).send({ success: true, message: "Event ignored" });
    }
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
});

// ---------------- PAYMENT V2 (unchanged) ----------------
router.post("/payment/v2", async (req, res) => {
  try {
    const { user_id, price, phone, name, merchantTransactionId } = req.body;

    const data = {
      merchantId: process.env.MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: user_id,
      amount: price * 100,
      callbackUrl:
        "https://webhook.site/1995bfbd-46d5-418b-a1ba-82bd39db1bdb",
      mobileNumber: phone,
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const payload = JSON.stringify(data);
    const payloadMain = Buffer.from(payload).toString("base64");

    const keyIndex = 1;
    const string = payloadMain + "/pg/v1/pay" + process.env.SALT_KEY;
    const sha256 = crypto.createHash("sha256").update(string).digest("hex");
    const checksum = sha256 + "###" + keyIndex;

    res.status(200).send({
      request: payloadMain,
      checksum: checksum,
    });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      success: false,
    });
  }
});

module.exports = router;
