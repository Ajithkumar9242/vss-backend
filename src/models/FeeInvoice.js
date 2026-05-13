const mongoose = require('mongoose');

/**
 * FeeInvoice — one invoice per student per academic year.
 * SOURCE OF TRUTH: StudentFeeProfile.
 * Installments are mirrored from StudentFeeProfile at generation time,
 * then tracked here (paidAmount, status) independently.
 */

const installmentDetailSchema = new mongoose.Schema(
  {
    installmentNo: { type: Number },
    label:         { type: String, trim: true },
    amount:        { type: Number, min: 0 },
    dueDate:       { type: Date, default: null },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },   // amount - paidAmount
    paidAt:        { type: Date, default: null },
    paymentMode:   {
      type: String,
      enum: ['cash', 'upi', 'online', 'razorpay', 'cheque', 'bank_transfer'],
      default: null,
    },
    collectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receiptNumber: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'paid', 'partial', 'overdue'],
      default: 'pending',
    },
    transactionId: { type: String, default: null },
  },
  { _id: true }
);

const feeInvoiceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },

    // Link back to StudentFeeProfile
    feeProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentFeeProfile',
      default: null,
    },

    // Payment schedule — mirrored from StudentFeeProfile.installments at generation
    installments: [installmentDetailSchema],

    // ── Amounts ──────────────────────────────────────────────
    grossFee:      { type: Number, default: 0, min: 0 },   // sum of components
    discountAmount:{ type: Number, default: 0, min: 0 },   // total discount
    netFee:        { type: Number, default: 0, min: 0 },   // grossFee - discountAmount
    paidAmount:    { type: Number, default: 0, min: 0 },   // total paid to date
    dueAmount:     { type: Number, default: 0, min: 0 },   // netFee + penalty - paidAmount

    // ── Penalty ───────────────────────────────────────────────
    penaltyAmount: { type: Number, default: 0, min: 0 },
    penaltyConfig: {
      enabled:   { type: Boolean, default: false },
      type:      { type: String, enum: ['percent', 'fixed'], default: 'fixed' },
      value:     { type: Number, default: 0, min: 0 },
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'monthly' },
    },
    waivedAmount:  { type: Number, default: 0, min: 0 },
    waivedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    waivedReason:  { type: String, trim: true, default: '' },
    waivedAt:      { type: Date, default: null },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'overdue'],
      default: 'unpaid',
    },

    // ── Key Dates ─────────────────────────────────────────────
    // nextDueDate = earliest unpaid installment dueDate (updated after each payment)
    nextDueDate: { type: Date, default: null },

    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    // ── Locking ───────────────────────────────────────────────
    locked:     { type: Boolean, default: false },
    lockedAt:   { type: Date, default: null },
    lockedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────
feeInvoiceSchema.index({ studentId: 1, academicYearId: 1 }, { unique: true });
feeInvoiceSchema.index({ status: 1 });
feeInvoiceSchema.index({ classId: 1 });
feeInvoiceSchema.index({ feeProfileId: 1 });

// ── Pre-save: auto-generate invoiceNumber, sync totals & status ──
feeInvoiceSchema.pre('save', async function () {
  // Auto-generate invoice number
  if (!this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('FeeInvoice').countDocuments();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // Sync netFee
  this.netFee = Math.max(0, (this.grossFee || 0) - (this.discountAmount || 0));

  // Sync dueAmount = netFee + penalty - waived - paid
  const net = this.netFee + (this.penaltyAmount || 0) - (this.waivedAmount || 0);
  this.dueAmount = Math.max(0, net - (this.paidAmount || 0));

  // Sync installment balanceAmount + auto-overdue
  const now = new Date();
  for (const inst of this.installments || []) {
    inst.balanceAmount = Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0));
    if (inst.status !== 'paid' && inst.status !== 'partial' && inst.dueDate && new Date(inst.dueDate) < now) {
      inst.status = 'overdue';
    }
  }

  // Auto-update invoice status
  if (this.paidAmount >= net && net > 0) {
    this.status = 'paid';
  } else if ((this.paidAmount || 0) > 0) {
    this.status = 'partial';
  } else if (this.nextDueDate && new Date(this.nextDueDate) < now && this.status !== 'paid') {
    this.status = 'overdue';
  } else {
    this.status = 'unpaid';
  }
});

module.exports = mongoose.model('FeeInvoice', feeInvoiceSchema);
