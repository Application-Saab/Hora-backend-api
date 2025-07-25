const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
    configurationId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Configurations"
    }],
    name: { type: String, default: '' },
    image: { type: String, default: '' },
    status: { type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('meal', mealSchema)