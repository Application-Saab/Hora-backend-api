const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
    name: {  type: String,  default: '' },
    image: {  type: String, default: ''  },
    ingredientTypeId: {  type: mongoose.Schema.Types.ObjectId, ref: "ingredientType", required: true }, 
    status: {  type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('Ingredient', ingredientSchema)