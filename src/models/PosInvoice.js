'use strict';
const mongoose = require('mongoose');

const posAuditSchema = new mongoose.Schema(
  {
    action:      { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedAt: { type: Date, default: Date.now },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const posLineItemSchema = new mongoose.Schema(
  {
    itemId:       { type: mongoose.Schema.Types.ObjectId, ref: 'PosItemCatalog', default: null },
    nameSnapshot: { type: String, required: true },
    qty:          { type: Number, required: true, min: 1 },
    unitPrice:    { type: Number, required: true, min: 0 },
    discount:     { type: Number, default: 0, min: 0 },
    taxPercent:   { type: Number, default: 0, min: 0 },
    lineTotal:    { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const posInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true, sparse: true },
    invoiceType:   { type: String, default: 'pos', enum: ['pos'] },

    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    parentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', default: null },
    studentSnapshot: {
      name:      { type: String, default: '' },
      rollNo:    { type: String, default: '' },
      className: { type: String, default: '' },
    },

    items:        { type: [posLineItemSchema], required: true },
    subtotal:     { type: Number, required: true, min: 0 },
    discountTotal:{ type: Number, default: 0, min: 0 },
    taxTotal:     { type: Number, default: 0, min: 0 },
    grandTotal:   { type: Number, required: true, min: 0 },

    paymentMode: {
      type: String,
      enum: ['cash', 'upi', 'razorpay', 'cheque'],
      required: true,
    },
    paymentRef:    { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ['paid', 'pending', 'cancelled', 'refunded'],
      default: 'paid',
    },
    status: {
      type: String,
      enum: ['paid', 'cancelled', 'refunded'],
      default: 'paid',
    },
    notes: { type: String, default: '' },

    cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt:  { type: Date, default: null },
    cancelReason: { type: String, default: null },

    // Append-only audit logs
    auditLogs: { type: [posAuditSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

posInvoiceSchema.index({ studentId: 1 });
posInvoiceSchema.index({ status: 1 });
posInvoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PosInvoice', posInvoiceSchema);
