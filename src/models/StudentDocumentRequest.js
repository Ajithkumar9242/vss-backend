'use strict';
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action:      { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedAt: { type: Date, default: Date.now },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const studentDocumentRequestSchema = new mongoose.Schema(
  {
    requestNumber:  { type: String, unique: true, sparse: true }, // REQ-YYYY-NNNNN
    studentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    parentUserId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    catalogItemId:  { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCatalog', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    copies:         { type: Number, default: 1, min: 1 },
    amount:         { type: Number, required: true, min: 0 },
    discount:       { type: Number, default: 0, min: 0 },
    netAmount:      { type: Number, required: true, min: 0 },
    parentNotes:    { type: String, trim: true, default: '' },
    adminNotes:     { type: String, trim: true, default: '' },

    // ── Payment ──────────────────────────────────────────────
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },
    paymentMode: {
      type: String,
      enum: ['razorpay', 'upi', 'cash', null],
      default: null,
    },

    // ── Request Flow ─────────────────────────────────────────
    requestStatus: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'fulfilled'],
      default: 'requested',
    },

    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:  { type: Date, default: null },
    rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt:  { type: Date, default: null },
    fulfilledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fulfilledAt: { type: Date, default: null },

    linkedVaultFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentVaultFile', default: null },

    // ── Audit Logs (append-only) ──────────────────────────────
    auditLogs: { type: [auditLogSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

studentDocumentRequestSchema.index({ studentId: 1, requestStatus: 1 });
studentDocumentRequestSchema.index({ parentUserId: 1 });
studentDocumentRequestSchema.index({ paymentStatus: 1, requestStatus: 1 });

module.exports = mongoose.model('StudentDocumentRequest', studentDocumentRequestSchema);
