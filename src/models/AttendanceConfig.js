const mongoose = require('mongoose');

// ─── Session sub-schema ───────────────────────────────────────
const sessionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Session name is required'],
      trim: true,
    },
    startTime: {
      type: String,   // stored as "HH:MM" e.g. "09:00"
      default: null,
    },
    endTime: {
      type: String,
      default: null,
    },
    order: {
      type: Number,
      required: [true, 'Session order is required'],
      min: [1, 'Order must be >= 1'],
    },
  },
  { _id: true }
);

// ─── Main schema ──────────────────────────────────────────────
const attendanceConfigSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: [true, 'Academic year is required'],
    },
    mode: {
      type: String,
      enum: ['session', 'period'],
      default: 'session',
    },
    sessions: {
      type: [sessionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// One config per academic year
attendanceConfigSchema.index({ academicYearId: 1 }, { unique: true });

// ─── Validation hook ─────────────────────────────────────────
attendanceConfigSchema.pre('validate', async function () {
  if (!this.sessions || this.sessions.length === 0) {
    throw new Error('At least one session is required');
  }
  if (this.sessions.length > 10) {
    throw new Error('Maximum 10 sessions allowed');
  }

  // Duplicate name check
  const names = this.sessions.map((s) => s.name.toLowerCase().trim());
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    throw new Error('Session names must be unique');
  }

  // Duplicate order check
  const orders = this.sessions.map((s) => s.order);
  const uniqueOrders = new Set(orders);
  if (uniqueOrders.size !== orders.length) {
    throw new Error('Session order values must be unique');
  }
});

module.exports = mongoose.model('AttendanceConfig', attendanceConfigSchema);
