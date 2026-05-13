const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    fromDate: {
      type: Date,
      required: [true, 'From date is required'],
    },
    toDate: {
      type: Date,
      required: [true, 'To date is required'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
    },
    outTime: {
      type: Date,
      default: null,
    },
    inTime: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ studentId: 1, status: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
