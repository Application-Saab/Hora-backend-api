const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
    name: {type: String,default: ''},
    image: {type: String,default: ''},
    is_dish: {type: Number,default: '1' /* 2-non veg 1-veg  */},
    description: {type: String,default: ''},
    dish_allow: {type: Boolean,default: '1'/* 1-main 0-serving  */},
    cuisineId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations"
    }],
    mealId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "meal"
    }],
    dish_rate: {type: String,default: ''},
    is_preparation: {type: Boolean,default: false /* 1-yes 0-No  */},
    cooking_min: {type: String,default: ''},
    preparation_min: {type: String,default: ''},
    is_fired: {type: String,default: ''},
    price: {type: String,default: ''},
    serving_dish: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations"
    }],
    special_appliance_id: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations"
    }],
    general_appliance_id: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations"
    }],
    is_gas: {type: Boolean,default: false /* 1-yes 0-no  */},
    ingredientUsed: {type: Array,default: [] /* [{name:'',_id:'',qty:'',unit:''}] */},
    per_plate_qty: {type: Object,default: '' /*{qty:'',unit:''} */},
    status: {type: Number,default: 1 /* 1-active 0-inactive 2-delete  */},
    categoryIds: {type: Array,default: [] /* ['Breakfast'] */},
    cuisineArray: { type: Array,default: [] /* [{name:'',_id:''}] */ },
    mealArray: { type: Array,default: [] /* [{name:'',_id:''}] */ },
    preperationtext: {type: String,default: ''},
    noofpeopleServedByDish: {type: Number,default: 0 },
    vendorMaterialPrice: {type: Number,default: 0 },
    executionPrice: {type: Number,default: 0 },
    horaAdvance: {type: Number,default: 0 }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('dish', dishSchema)
