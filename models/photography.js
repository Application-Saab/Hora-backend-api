const mongoose = require('mongoose');

const photographySchema = new mongoose.Schema({
    id: {
        type: mongoose.Schema.Types.ObjectId
    },
    name: {
        type: String,
        required: true
    },
    short_link: {
        type: String,
    },
    featured_image: {
        type: String
    },
    caption: String,
    featured_images: {
        url: String,
        caption: String,
        small: String,
        webp_small: String,
        thumbnail: String,
        large: String,
        original: String,
        webp_thumbnail: String,
        webp_large: String,
        webp_original: String
    },
    badge: String,
    price: {
        type: String,
        
    },
    cost_price: {
        type:String,
    },
    type: String,
    is_wishlisted: {
        type: Boolean,
        default: false
    },
    ratings: {
        score: Number,
        count: Number
    },
    attributes: {
        price_subtext: [String],
        locality: [String],
        caption: [String]
    },
    inclusion: [
        String
    ],
    tag : [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "meal"
    }],
    status: {  type: Number, default: 1 /* 1-active 0-inactive 2-delete  */ }
},{
    strict: false,
    timestamps: true
});

const Photography = mongoose.model('photography', photographySchema);

module.exports = Photography;
