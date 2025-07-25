const mongoose = require('mongoose');

const configurationSchema = new mongoose.Schema({
    name: {  type: String,  default: '' },
    image: { type: String, default: '' },
    type: { type: String, enum: ['cuisine', 'appliance', 'dish'], default: 'cuisine' },
    sub_type: { type: String, default: '1' /* 0-general 1-special  */ },
    status: { type: Number, default: '1' /* 1-active 0-inactive 2-delete  */ }
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('Configurations', configurationSchema)