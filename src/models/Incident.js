const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    type: {
      type: String,
      enum: ['fight', 'misconduct', 'bullying', 'property_damage', 'truancy', 'other'],
      required: [true, 'Incident type is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    actionTaken: {
      type: String,
      trim: true,
      default: null,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

incidentSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('Incident', incidentSchema);
