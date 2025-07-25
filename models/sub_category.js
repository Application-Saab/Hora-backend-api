const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "category", required: true },
    name: { type: String, default: '' },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('subcategory', subcategorySchema)