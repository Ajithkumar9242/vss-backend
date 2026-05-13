const mongoose = require('mongoose');

// Singleton — only one payment setting record
const paymentSettingSchema = new mongoose.Schema(
  {
    razorpayKey: { type: String, trim: true },
    razorpaySecret: { type: String, trim: true, select: false }, // Never expose secret
    qrCodeUrl: { type: String, trim: true },
    allowManualPayment: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentSetting', paymentSettingSchema);
