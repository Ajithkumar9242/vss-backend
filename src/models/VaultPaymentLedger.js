'use strict';
const mongoose = require('mongoose');

/**
 * VaultPaymentLedger — immutable payment ledger entries for document requests.
 * Records are NEVER modified after creation.
 */
const vaultPaymentLedgerSchema = new mongoose.Schema(
  {
    requestId:  { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocumentRequest', required: true },
    studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount:     { type: Number, required: true, min: 0 },
    mode:       { type: String, enum: ['razorpay', 'upi', 'cash'], required: true },

    // Razorpay fields (populated for online payments)
    razorpayOrderId:   { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    // Admin cash override fields
    adminOverride:  { type: Boolean, default: false },
    overrideReason: { type: String, default: null },

    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedAt:  { type: Date, default: null },
  },
  {
    timestamps: true,
    // Prevent any updates after creation
  }
);

vaultPaymentLedgerSchema.index({ requestId: 1 });
vaultPaymentLedgerSchema.index({ studentId: 1 });

module.exports = mongoose.model('VaultPaymentLedger', vaultPaymentLedgerSchema);
