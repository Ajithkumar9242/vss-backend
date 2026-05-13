const mongoose = require('mongoose');

/**
 * Exam schema — production ERP version.
 *
 * Lifecycle: Draft → Published → Locked
 *   Draft     : can edit everything
 *   Published : marks entry allowed; exam metadata frozen
 *   Locked    : no further changes; results finalized
 */
const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Exam name is required'],
      trim: true,
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
    // Flat array of subject ObjectIds (no per-subject marks config)
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
      },
    ],
    maxMarks: {
      type: Number,
      default: 100,
      min: [1, 'Max marks must be at least 1'],
    },
    passingMarks: {
      type: Number,
      default: 35,
      min: [0, 'Passing marks cannot be negative'],
    },
    // Date range (or single date via startDate)
    startDate: { type: Date, default: null },
    endDate:   { type: Date, default: null },

    // Legacy single-date field (kept for backward compat)
    examDate: { type: Date, default: null },

    // Lifecycle flags
    isPublished: { type: Boolean, default: false },
    isLocked:    { type: Boolean, default: false },
    isActive:    { type: Boolean, default: true },  // soft-delete
  },
  { timestamps: true }
);

// One exam name per class per academic year
examSchema.index({ name: 1, classId: 1, academicYearId: 1 }, { unique: true });

module.exports = mongoose.model('Exam', examSchema);
