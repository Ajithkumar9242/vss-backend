const mongoose = require('mongoose');

const academicTermSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: [true, 'Academic year is required'],
    },
    name: { type: String, required: [true, 'Term name is required'], trim: true },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate: { type: Date, required: [true, 'End date is required'] },
  },
  { timestamps: true }
);

// One term name per academic year
academicTermSchema.index({ academicYearId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('AcademicTerm', academicTermSchema);
