const mongoose = require('mongoose');

const ingredientTypeSchema = new mongoose.Schema({
    name: {  type: String,  default: '' },
    type: {  type: Number, default: 1 /* 1-ingredient 0-dish  */ },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ },
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('ingredientType', ingredientTypeSchema)