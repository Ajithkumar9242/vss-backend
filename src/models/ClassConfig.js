const mongoose = require('mongoose');

const classConfigSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: [true, 'Academic year is required'],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    sections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Section',
      },
    ],
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
      },
    ]
  },
  { timestamps: true }
);

// Only one config per class per academic year
classConfigSchema.index({ academicYearId: 1, classId: 1 }, { unique: true });

module.exports = mongoose.model('ClassConfig', classConfigSchema);
