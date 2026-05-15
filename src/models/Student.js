const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    admissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admission',
      default: null,
    },
    // ─── Admission Number (auto-generated on approval) ────────
    admissionNumber: {
      type: String,
      unique: true,
      sparse: true,   // allows multiple nulls
      trim: true,
      default: null,
    },
    admissionNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: null,
    },
    registerNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: null,
    },
    rollNo: {
      type: String,
      unique: true,
      required: true,
    },
    rollNumberMode: {
      type: String,
      enum: ['manual', 'auto'],
      default: 'manual',
    },
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
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
      default: null,
    },
    parentName: {
      type: String,
      required: true,
      trim: true,
    },
    parentPhone: {
      type: String,
      required: true,
    },
    parentEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    bloodGroup: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parent',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // ─── Academic context ────────────────────────────────────
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
