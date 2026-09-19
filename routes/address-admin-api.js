const express = require('express');
const addressModel = require('../models/address');
const router = express.Router();

//blocker of this getMealDish api 
router.post('/editByUserIDAdmin', async (req, res, next) => {
    try {
        const { userId } = req.body;
        const updatedData = req.body;

        const options = { new: true, upsert: true };

        const result = await addressModel.findOneAndUpdate(
            { userId: userId },
            updatedData,
            options
        );

        if (!result) {
            return res.status(404).json({
                error: true,
                status: 404,
                message: 'Address not found'
            });
        }

        return res.json({
            error: false,
            status: 200,
            message: 'Address Updated Successfully',
            data: result
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;