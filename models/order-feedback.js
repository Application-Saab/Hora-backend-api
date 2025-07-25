const mongoose = require('mongoose');

const orderFeedbackSchema = new mongoose.Schema({
    slabPicture: { type: String,default: '' },
    sinkPicture: { type: String,default: '' },
    gasBurnerPicture: { type: String,default: '' },
    kitchenPicture: { type: String,default: '' },
    floorPicture: { type: String,default: '' },
    familyPicture: { type: String,default: '' },
    no_of_people: { type: Number, default: 0 },
    ingredientRating: { type: Number, default: 0 },
    bookingExperienceRating: { type: Number, default: 0 },
    customerBehaviourRating: { type: Number, default: 0 },
    additionalComments: {type: String,default: ''},
    orderId: { type: mongoose.Schema.Types.ObjectId,ref: "order" },
    isPaymentCollect: {type: Boolean,default: false /* true-yes false-no  */},
    status: {type: Number,default: '1' /* 1-active 0-inactive 2-delete  */},
    userOrderDishImageArray: {type: Array,default: []},
}, {
    strict: false,
    timestamps: true
});

module.exports = mongoose.model('order-feedback', orderFeedbackSchema)