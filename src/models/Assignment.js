const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  fileUrl:  { type: String, required: true },
  fileName: { type: String, default: null },
  mimeType: { type: String, default: null },
  size:     { type: Number, default: 0 },
}, { _id: false });

const assignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Assignment title is required'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, default: '' },
    classId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true, index: true },
    subjectId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    facultyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true, index: true },
    dueDate:    { type: Date, required: true },
    maxMarks:   { type: Number, default: 100, min: 0 },
    attachments: [attachmentSchema],
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ classId: 1, subjectId: 1, isActive: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
