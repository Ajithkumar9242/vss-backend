const mongoose = require('mongoose');

const feePaymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [1, 'Payment amount must be at least 1'],
    },
    paymentMode: {
      type: String,
      enum: {
        values: ['cash', 'upi', 'online', 'razorpay', 'cheque', 'bank_transfer'],
        message: 'Invalid payment mode',
      },
      required: [true, 'Payment mode is required'],
    },
    transactionId: {
      type: String,
      trim: true,
      default: null,
    },
    // Link to FeeInvoice (optional — backward compat with old payments)
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeInvoice',
      default: null,
    },
    // NEW: Which installment this payment covers (optional)
    installmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    installmentNo: {
      type: Number,
      default: null,
    },
    // Manual payment proof (screenshot / receipt image)
    proofUrl: {
      type: String,
      trim: true,
      default: null,
    },
    // NEW: Who collected this payment (admin/accountant user)
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // approval status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    remarks: {
      type: String,
      trim: true,
      default: null,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

// Index for fast look-ups by student
feePaymentSchema.index({ studentId: 1, paidAt: -1 });
feePaymentSchema.index({ invoiceId: 1 });

// Auto-generate receiptNumber before save
feePaymentSchema.pre('save', async function () {
  if (!this.receiptNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('FeePayment').countDocuments();
    this.receiptNumber = `RCP-${year}-${String(count + 1).padStart(5, '0')}`;
  }
});

module.exports = mongoose.model('FeePayment', feePaymentSchema);
