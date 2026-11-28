const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    orderId: { type: Number, required: true, unique: true },
    image: { type: String, default: '' },      // empty until the invoice image is uploaded
    invoiceDate: { type: Date },               // set once, when the invoice is first created
    invoiceNo: { type: String, default: '' },
    customerName: { type: String, default: '' },
    phone: { type: String, default: '' },
    total: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('InvoiceImage', schema);