const mongoose = require('mongoose');

/**
 * FeeComponent — master list of fee types (Tuition, Hostel, Bus, Meals, etc.)
 * Mandatory components auto-apply to ALL students.
 * Optional components can be selectively assigned.
 */
const feeComponentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Component name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Component code is required'],
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    mandatory: {
      type: Boolean,
      default: false,
    },
    recurringType: {
      type: String,
      enum: ['yearly', 'monthly', 'quarterly', 'one_time'],
      default: 'yearly',
    },
    active: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Unique code constraint
feeComponentSchema.index({ code: 1 }, { unique: true });
feeComponentSchema.index({ mandatory: 1, active: 1 });

module.exports = mongoose.model('FeeComponent', feeComponentSchema);
