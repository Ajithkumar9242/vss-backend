const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
    },
    date: {
      type: Date,
      required: true,
    },
    // Session from AttendanceConfig (e.g. "Morning", "P1")
    session: {
      type: String,
      default: 'Morning',
      trim: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      required: true,
    },
    // Lock prevents non-admin edits after submission
    isLocked: {
      type: Boolean,
      default: false,
    },
    remarks: {
      type: String,
      trim: true,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Unique per student per date per session
attendanceSchema.index({ studentId: 1, date: 1, session: 1 }, { unique: true });
// Fast lookups for class+date+session bulk fetch
attendanceSchema.index({ classId: 1, date: 1, session: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
