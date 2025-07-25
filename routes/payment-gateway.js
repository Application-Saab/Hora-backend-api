const crypto = require('crypto');
const request = require('request');
const express = require('express');
const router = express.Router();

router.post('/payment', async (req, res) => {
    try {
        const { user_id, price, phone, name, merchantTransactionId } = req.body;
        
        const data = {
            merchantId: process.env.MERCHANT_ID,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: user_id,
            amount: price * 100,
            "redirectUrl": `https://horaservices.com/?transaction=${merchantTransactionId}`,
            "redirectMode": "POST",
            "callbackUrl": "https://webhook.site/1995bfbd-46d5-418b-a1ba-82bd39db1bdb",
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };

        const payload = JSON.stringify(data);
        const payloadMain = Buffer.from(payload).toString('base64');
        const keyIndex = 1;
        const string = payloadMain + '/pg/v1/pay' + process.env.SALT_KEY;
        const sha256 = crypto.createHash('sha256').update(string).digest('hex');
        const checksum = sha256 + '###' + keyIndex;
        const prod_URL = "https://api.phonepe.com/apis/hermes/pg/v1/pay";

        const requestOptions = {
            method: 'POST',
            url: prod_URL,
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            },
            json: {
                request: payloadMain
            }
        };
        
        console.log(requestOptions)
        request(requestOptions, function (error, response, body) {
            if (error) {
                console.error(error);
                res.status(500).send({
                    message: error.message,
                    success: false
                });
            } else {
               
                if (body.data.instrumentResponse)
                res.status(200).send(body.data.instrumentResponse.redirectInfo.url);
            }
        });

    } catch (error) {
        res.status(500).send({
            message: error.message,
            success: false
        });
    }
});

router.post('/status/:txnId', async (req, res) => {
    const merchantTransactionId = req.params['txnId'];
    const merchantId = process.env.MERCHANT_ID;
    const keyIndex = 1;
    const string = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + process.env.SALT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = sha256 + "###" + keyIndex;

    const options = {
        method: 'GET',
        url: `https://api.phonepe.com/apis/hermes/pg/v1/status/${merchantId}/${merchantTransactionId}`,
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': `${merchantId}`
        }
    };

    // CHECK PAYMENT STATUS
    request(options, function (error, response, body) {
        if (error) {
            console.error(error);
            res.status(500).send({ msg: error.message });
        } else {
            const responseData = JSON.parse(body);
            if (responseData.success === true) {
                res.status(200).send({ success: true, message: responseData.code });
            }
        }
    });
});

router.post('/payment/v2', async (req, res) => {
    try {
        const { user_id, price, phone, name, merchantTransactionId } = req.body;
        
        const data = {
            merchantId: process.env.MERCHANT_ID,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: user_id,
            amount: price * 100,
            "callbackUrl": "https://webhook.site/1995bfbd-46d5-418b-a1ba-82bd39db1bdb",
            mobileNumber:phone,
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };

        console.log(data);
        const payload = JSON.stringify(data);
        const payloadMain = Buffer.from(payload).toString('base64');


        const keyIndex = 1;
        const string = payloadMain + '/pg/v1/pay' + process.env.SALT_KEY;
        const sha256 = crypto.createHash('sha256').update(string).digest('hex');
        const checksum = sha256 + '###' + keyIndex;
      

        res.status(200).send({
            request:payloadMain,
            checksum:checksum
        })

    } catch (error) {
        res.status(500).send({
            message: error.message,
            success: false
        });
    }
});

module.exports = router;
