const mongoose = require('mongoose');

const staffDutySchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      required: [true, 'Faculty is required'],
    },
    dutyType: {
      type: String,
      enum: ['hostel', 'night_duty', 'class', 'sports', 'exam', 'other'],
      required: [true, 'Duty type is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    shift: {
      type: String,
      enum: ['morning', 'afternoon', 'night', 'full_day'],
      default: 'full_day',
    },
    notes: {
      type: String,
      trim: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

staffDutySchema.index({ facultyId: 1, date: 1 });
staffDutySchema.index({ date: 1, dutyType: 1 });

module.exports = mongoose.model('StaffDuty', staffDutySchema);
