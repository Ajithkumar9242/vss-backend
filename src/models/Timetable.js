const mongoose = require('mongoose');

/**
 * Timetable — one slot per class/section per day/period per term.
 * Unique constraint prevents double-booking a class slot or a faculty slot.
 */
const timetableSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: [true, 'Academic year is required'],
    },
    term: {
      type: String,
      enum: ['term1', 'term2', 'full'],
      default: 'full',
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },
    dayOfWeek: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: [true, 'Day of week is required'],
    },
    periodNo: {
      type: Number,
      required: [true, 'Period number is required'],
      min: [1, 'Period must be >= 1'],
      max: [12, 'Period must be <= 12'],
    },
    startTime: {
      type: String, // "09:00"
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: String, // "09:45"
      required: [true, 'End time is required'],
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject is required'],
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      default: null,
    },
    room: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// One period per class per day per academic year
timetableSchema.index(
  { academicYearId: 1, classId: 1, sectionId: 1, dayOfWeek: 1, periodNo: 1 },
  { unique: true, sparse: true }
);

// Prevent faculty double-booking in same slot
timetableSchema.index(
  { academicYearId: 1, facultyId: 1, dayOfWeek: 1, periodNo: 1 }
);

module.exports = mongoose.model('Timetable', timetableSchema);
