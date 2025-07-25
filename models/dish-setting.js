const mongoose = require('mongoose');

const dishsettingSchema = new mongoose.Schema({
    dish_allowed_per_order: { type: Number,default: 0},
    dish_allowed_with_1_burner: { type: Number,default: 0},
    dish_allowed_with_2_burner: { type: Number,default: 0},
    dish_allowed_with_3_burner: { type: Number,default: 0},
    dish_allowed_with_4_burner: { type: Number,default: 0},
    dish_allowed_with_5_burner: { type: Number,default: 0},
    dish_allowed_with_6_burner: { type: Number,default: 0},
    noofcuisine_per_order: { type: Number,default: 0},
    noofmeals_per_order: { type: Number,default: 0},
    breakfast_start_time: { type: Number,default: 0},
    breakfast_end_time: { type: Number,default: 0},
    lunch_serving_start_time: { type: Number,default: 0},
    lunch_serving_end_time: { type: Number,default: 0},
    dinner_serving_start_time: { type: Number,default: 0},
    dinner_serving_end_time: { type: Number,default: 0},
    minimum_no_of_people_required: { type: Number,default: 0},
    maximum_no_of_people_required: { type: Number,default: 0},
    minimum_gap_order_time: { type: Number,default: 0},
    maximum_dish_allowed_with_meal: { type: Number,default: 0},
}, { strict: false, timestamps: true });

module.exports = mongoose.model('dishsetting', dishsettingSchema)