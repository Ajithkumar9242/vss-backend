const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student',    required: true, index: true },
    fileUrl:      { type: String, default: null },
    fileName:     { type: String, default: null },
    mimeType:     { type: String, default: null },
    remarks:      { type: String, trim: true, default: '' },       // student note on submit
    submittedAt:  { type: Date, default: Date.now },
    // Grading
    marks:         { type: Number, default: null, min: 0 },
    feedback:      { type: String, trim: true, default: '' },       // faculty feedback
    status: {
      type: String,
      enum: ['pending', 'submitted', 'graded', 'late'],
      default: 'pending',
    },
    gradedAt:  { type: Date, default: null },
    gradedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One submission per student per assignment
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
