const mongoose = require('mongoose');

const gradeConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Grade name is required'], trim: true },
    minMarks: { type: Number, required: [true, 'Min marks required'], min: 0 },
    maxMarks: { type: Number, required: [true, 'Max marks required'], min: 0 },
    remarks: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GradeConfig', gradeConfigSchema);
