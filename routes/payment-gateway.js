const crypto = require("crypto");
const request = require("request");
const express = require("express");
const router = express.Router();
const userModel = require("../models/user");
const orderModel = require("../models/order");

router.post("/payment", async (req, res) => {
  try {
    let { user_id, price, phone, name, merchantTransactionId } = req.body;
    if (user_id === "670cafda63f0548f592bf2f2") {
      price = 1; // For testing purpose only
    }

    // Validate inputs
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

    const requestOptions = {
      method: "POST",
      url: "https://api.razorpay.com/v1/payment_links",
      auth: {
        user: process.env.RAZORPAY_KEY_ID,
        pass: process.env.RAZORPAY_KEY_SECRET,
      },
      headers: {
        "Content-Type": "application/json",
      },
      json: data,
    };

    request(requestOptions, function (error, response, body) {
      if (error) {
        console.error("Request error:", error);
        return res.status(500).send({
          message: error.message,
          success: false,
        });
      }

      if (response.statusCode === 200 && body.short_url) {
        res.status(200).send(body.short_url); // Return the payment URL
      } else {
        res.status(response.statusCode || 500).send({
          message: body.error.description || "Failed to create payment link",
          success: false,
          errorDetails: body.error || body,
        });
      }
    });
  } catch (error) {
    console.error("Catch error:", error);
    res.status(500).send({
      message: error.message,
      success: false,
    });
  }
});

router.post("/status/:txnId", async (req, res) => {
  try {
    const merchantTransactionId = req.params["txnId"];

    const options = {
      method: "GET",
      url: `https://api.razorpay.com/v1/payment_links?reference_id=${merchantTransactionId}`,
      auth: {
        user: process.env.RAZORPAY_KEY_ID,
        pass: process.env.RAZORPAY_KEY_SECRET,
      },
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    request(options, function (error, response, body) {
      if (error) {
        console.error("Request error:", error);
        return res.status(500).send({
          message: error.message,
          success: false,
        });
      }

      try {
        const responseData = JSON.parse(body);
        const paymentLinks = responseData.payment_links || [];

        if (response.statusCode === 200 && paymentLinks.length > 0) {
          const paymentLink = paymentLinks[0];
          if (paymentLink.status === "paid") {
            res.status(200).send({
              success: true,
              message: "PAYMENT_SUCCESS",
            });
          } else {
            res.status(200).send({
              success: false,
              message: paymentLink.status.toUpperCase(),
            });
          }
        } else {
          res.status(response.statusCode || 404).send({
            message: "Payment link not found",
            success: false,
            errorDetails: responseData,
          });
        }
      } catch (parseError) {
        console.error("Parse error:", parseError);
        res.status(500).send({
          message: "Failed to parse Razorpay response",
          success: false,
          errorDetails: parseError.message,
        });
      }
    });
  } catch (error) {
    console.error("Catch error:", error);
    res.status(500).send({
      message: error.message,
      success: false,
    });
  }
});

router.post("/razorpay/webhook", async (req, res) => {
  try {
    const webhookSecret = "Sahaj@22";
    const receivedSignature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    // Signature Verification
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== receivedSignature) {
      console.log("Invalid webhook signature");
      return res
        .status(400)
        .send({ success: false, message: "Invalid signature" });
    }

    // Immediate success response for razorpay webhook
    res.status(200).send({ success: true, message: "Received and processing" });

    // Background Processing
    const event = req.body.event;
    const payload =
      req.body.payload.payment.entity || req.body.payload.payment_link.entity;
    console.log("Webhook event received (Background):", event);

    if (event === "payment_link.paid" || event === "payment.captured") {
      const referenceId =
        payload.reference_id || payload.notes.merchantTransactionId;

      if (!referenceId) {
        console.log("Missing referenceId, skipping background update");
        return;
      }

      const order = await orderModel.findOne({ _id: referenceId });

      if (!order) {
        console.log("Order not found for referenceId", referenceId);
        return;
      }

      if (order.status === 1) {
        console.log("Order already marked as paid");
        return;
      }

      await orderModel.findByIdAndUpdate(order._id, { $set: { status: 1 } });
      console.log("Order updated successfully for:", referenceId);
    } else {
      console.log("Ignored event :", event);
    }
  } catch (error) {
    console.error("Critical Webhook processing error:", error);
  }
});

router.post("/payment/v2", async (req, res) => {
  try {
    const { user_id, price, phone, name, merchantTransactionId } = req.body;

    const data = {
      merchantId: process.env.MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: user_id,
      amount: price * 100,
      callbackUrl: "https://webhook.site/1995bfbd-46d5-418b-a1ba-82bd39db1bdb",
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
