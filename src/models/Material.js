const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    title:      { type: String, required: true, trim: true, maxlength: 200 },
    description:{ type: String, trim: true, default: '' },
    type: {
      type: String,
      enum: ['pdf', 'video', 'audio', 'image', 'link', 'other'],
      required: true,
    },
    // ─── Legacy single-file fields (kept for backward compat) ───
    fileUrl:    { type: String, default: null },
    fileName:   { type: String, default: null },
    mimeType:   { type: String, default: null },
    size:       { type: Number, default: 0 },
    // ─── Multi-file support ─────────────────────────────────────
    files: [
      {
        url:      { type: String },
        name:     { type: String },
        type:     { type: String },
        size:     { type: Number },
        publicId: { type: String },
      },
    ],
    classId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true, index: true },
    subjectId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

materialSchema.index({ classId: 1, subjectId: 1, isActive: 1 });

module.exports = mongoose.model('Material', materialSchema);

