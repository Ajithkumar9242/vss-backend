'use strict';

const mongoose = require('mongoose');

// ─── Embedded per-student row ────────────────────────────────
const rowSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    attendedClasses: {
      type: Number,
      required: true,
      min: [0, 'Attended classes cannot be negative'],
      default: 0,
    },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────
const monthlyAttendanceSchema = new mongoose.Schema(
  {
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
    // "YYYY-MM" e.g. "2025-06"
    monthKey: {
      type: String,
      required: [true, 'monthKey (YYYY-MM) is required'],
      match: [/^\d{4}-\d{2}$/, 'monthKey must be YYYY-MM format'],
      trim: true,
    },
    totalClassesConducted: {
      type: Number,
      required: [true, 'totalClassesConducted is required'],
      min: [0, 'Cannot be negative'],
    },
    rows: {
      type: [rowSchema],
      default: [],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Unique per class per academic year per month
monthlyAttendanceSchema.index({ classId: 1, academicYearId: 1, monthKey: 1 }, { unique: true });
// Fast student lookup for student report
monthlyAttendanceSchema.index({ 'rows.studentId': 1 });

module.exports = mongoose.model('MonthlyAttendance', monthlyAttendanceSchema);
