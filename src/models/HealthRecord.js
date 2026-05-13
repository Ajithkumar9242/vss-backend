const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    issue: {
      type: String,
      required: [true, 'Health issue is required'],
      trim: true,
    },
    medication: {
      type: String,
      trim: true,
    },
    doctorVisit: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

healthRecordSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
