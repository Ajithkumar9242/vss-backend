const mongoose = require('mongoose');

/**
 * Mark schema — one row per student per subject per exam.
 * maxMarks is stored from exam.maxMarks for historical integrity.
 */
const markSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam is required'],
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject is required'],
    },
    marksObtained: {
      type: Number,
      required: [true, 'Marks obtained is required'],
      min: [0, 'Marks cannot be negative'],
    },
    // Snapshotted from exam.maxMarks at time of entry
    maxMarks: {
      type: Number,
      required: [true, 'Maximum marks is required'],
      min: [1, 'Max marks must be at least 1'],
    },
    // Computed: pass/fail per subject (snapshotted)
    passed: {
      type: Boolean,
      default: null,
    },
    grade: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// One mark entry per exam + student + subject
markSchema.index({ examId: 1, studentId: 1, subjectId: 1 }, { unique: true });

module.exports = mongoose.model('Mark', markSchema);
