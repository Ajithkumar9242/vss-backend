const mongoose = require('mongoose');

/**
 * StudentFeeProfile — SINGLE SOURCE OF TRUTH per student per academic year.
 *
 * Holds:
 *   - Which fee components a student pays  (selectedComponents)
 *   - Payment schedule with due dates       (installments)
 *   - Discounts                             (discounts)
 *   - Penalty configuration                 (penaltyConfig)
 *   - Computed totals                       (grossFee, discountAmt, netFee)
 */

// ── Discount sub-schema ────────────────────────────────────────
const discountSchema = new mongoose.Schema(
  {
    type:         {
      type: String,
      enum: ['scholarship', 'sibling', 'staff_child', 'custom'],
      required: true,
    },
    label:        { type: String, trim: true, default: '' },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    value:        { type: Number, required: true, min: 0 },
    reason:       { type: String, trim: true, default: '' },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appliedAt:    { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Selected fee component sub-schema ──────────────────────────
const selectedComponentSchema = new mongoose.Schema(
  {
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeComponent',
      required: true,
    },
    name:      { type: String, trim: true },
    code:      { type: String, trim: true },
    amount:    { type: Number, min: 0 },
    mandatory: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Installment sub-schema (payment schedule definition) ───────
// These are the PLANNED installments with due dates.
// Actual payment tracking lives in FeeInvoice.installments.
const installmentSchema = new mongoose.Schema(
  {
    installmentNo: { type: Number, required: true },
    label:         { type: String, trim: true, required: true },
    amount:        { type: Number, required: true, min: 0 },
    dueDate:       { type: Date, default: null },
  },
  { _id: true }
);

// ── Main schema ────────────────────────────────────────────────
const studentFeeProfileSchema = new mongoose.Schema(
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
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },

    // Which fee components this student pays
    selectedComponents: [selectedComponentSchema],

    // Payment schedule: when + how much per installment
    // Rule: sum(installments.amount) === netFee  (±1 rounding tolerance)
    installments: [installmentSchema],

    // Discounts applied to this student
    discounts: [discountSchema],

    // Penalty configuration for this student
    penaltyConfig: {
      enabled:   { type: Boolean, default: false },
      type:      { type: String, enum: ['percent', 'fixed'], default: 'fixed' },
      value:     { type: Number, default: 0, min: 0 },
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'monthly' },
    },

    // Computed totals — auto-updated by pre-save hook
    grossFee:    { type: Number, default: 0 },  // sum(selectedComponents.amount)
    discountAmt: { type: Number, default: 0 },  // computed from discounts[]
    netFee:      { type: Number, default: 0 },  // grossFee - discountAmt

    // Admin notes
    notes: { type: String, trim: true, default: '' },

    // Schedule sync state
    // true  = discount changed netFee after a schedule was set — admin must re-save schedule
    // false = schedule is in sync with current netFee (or no schedule yet)
    scheduleOutOfSync: { type: Boolean, default: false },

    // Locking
    locked:     { type: Boolean, default: false },
    lockedAt:   { type: Date, default: null },
    lockedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    unlockedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────
studentFeeProfileSchema.index({ studentId: 1, academicYearId: 1 }, { unique: true });
studentFeeProfileSchema.index({ classId: 1, academicYearId: 1 });

// ── Pre-save: compute grossFee, discountAmt, netFee; validate schedule ──
studentFeeProfileSchema.pre('save', function () {
  // 1. Gross fee = sum of selected components
  this.grossFee = (this.selectedComponents || []).reduce(
    (sum, c) => sum + (c.amount || 0),
    0
  );

  // 2. Discount amount
  let disc = 0;
  const prevNetFee = this.netFee || 0; // capture before update
  for (const d of this.discounts || []) {
    if (d.discountType === 'percent') {
      disc += Math.round((this.grossFee * d.value) / 100);
    } else {
      disc += d.value;
    }
  }
  this.discountAmt = disc;
  const newNetFee  = Math.max(0, this.grossFee - disc);
  this.netFee      = newNetFee;

  // 3. NO auto-fallback installment.
  //    If installments is empty, profile saves fine — but invoice generation
  //    will be blocked until admin manually adds a schedule.

  if (!this.installments || this.installments.length === 0) {
    // No schedule yet — nothing to validate, clear out-of-sync flag
    this.scheduleOutOfSync = false;
    return;
  }

  // 4. Schedule exists — check whether it is still in sync with netFee.
  //    If netFee changed (e.g. discount added/removed) mark out-of-sync
  //    so invoice generation is blocked until admin re-saves the schedule.
  const instSum = this.installments.reduce((s, i) => s + (i.amount || 0), 0);
  const outOfSync = Math.abs(instSum - newNetFee) > 1;

  if (outOfSync) {
    // Mark out-of-sync but DO NOT throw — allow the profile save to succeed.
    // This lets addDiscount() work even when a schedule exists.
    this.scheduleOutOfSync = true;
    return;
  }

  // 5. Schedule is valid — clear out-of-sync flag
  this.scheduleOutOfSync = false;
});

module.exports = mongoose.model('StudentFeeProfile', studentFeeProfileSchema);
