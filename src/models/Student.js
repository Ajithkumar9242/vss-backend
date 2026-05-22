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
    },
    admissionNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    registerNo: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
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
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeStructure',
      default: null,
    },
    admissionDate: {
      type: Date,
      default: null,
    },
    mode: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline',
    },
    type: {
      type: String,
      enum: ['residential', 'day-boarding'],
      default: 'day-boarding',
    },
    secondLanguage: {
      type: String,
      trim: true,
    },
    dobInWords: {
      type: String,
      trim: true,
    },
    placeOfBirth: {
      type: String,
      trim: true,
    },
    nationality: {
      type: String,
      trim: true,
      default: 'Indian',
    },
    religion: {
      type: String,
      trim: true,
    },
    motherTongue: {
      type: String,
      trim: true,
    },
    aadhaarNo: {
      type: String,
      trim: true,
    },
    caste: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['General', 'OBC', 'SC', 'ST', 'Others'],
      default: 'General',
    },
    numberOfSiblings: {
      type: Number,
      default: 0,
    },
    siblingStudyingInSchool: {
      type: Boolean,
      default: false,
    },
    previousSchool: {
      type: String,
      trim: true,
    },
    previousSchoolAddress: {
      type: String,
      trim: true,
    },
    previousBoard: {
      type: String,
      trim: true,
    },
    mediumOfInstruction: {
      type: String,
      trim: true,
    },
    classLastStudied: {
      type: String,
      trim: true,
    },
    yearOfCompletion: {
      type: String,
      trim: true,
    },
    tcNumber: {
      type: String,
      trim: true,
    },
    tcDate: {
      type: Date,
      default: null,
    },
    satsNumber: {
      type: String,
      trim: true,
    },
    apaarNumber: {
      type: String,
      trim: true,
    },
    penNumber: {
      type: String,
      trim: true,
    },
    hasTC: {
      type: Boolean,
      default: false,
    },
    father: {
      name: { type: String, trim: true },
      aadhaarNo: { type: String, trim: true },
      annualIncome: { type: Number },
      qualification: { type: String, trim: true },
      occupation: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    mother: {
      name: { type: String, trim: true },
      aadhaarNo: { type: String, trim: true },
      annualIncome: { type: Number },
      qualification: { type: String, trim: true },
      occupation: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    guardian: {
      name: { type: String, trim: true },
      relationship: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    motherPhone: {
      type: String,
      trim: true,
    },
    guardianPhone: {
      type: String,
      trim: true,
    },
    allergies: {
      type: String,
      trim: true,
    },
    medicalConditions: {
      type: String,
      trim: true,
    },
    senType: {
      type: String,
      trim: true,
    },
    senSupportLevel: {
      type: String,
      enum: ['Mild', 'Moderate', 'Intensive', ''],
      default: '',
    },
    studentPhoto: {
      type: String,
      trim: true,
    },
    documentChecklist: {
      birthCertificate: { type: Boolean, default: false },
      aadhaarStudent: { type: Boolean, default: false },
      aadhaarParents: { type: Boolean, default: false },
      previousReportCard: { type: Boolean, default: false },
      tc: { type: Boolean, default: false },
      casteCertificate: { type: Boolean, default: false },
      photosCount: { type: Number, default: 0 },
    },
    documents: [
      {
        name: { type: String, trim: true },
        url: { type: String },
        publicId: { type: String },
      },
    ],
    applicationFormNo: {
      type: String,
      trim: true,
    },
    feeReceiptNo: {
      type: String,
      trim: true,
    },
    receiptDate: {
      type: Date,
      default: null,
    },
    documentsVerifiedBy: {
      type: String,
      trim: true,
    },
    documentsVerifiedDate: {
      type: Date,
      default: null,
    },
    principalRemarks: {
      type: String,
      trim: true,
    },
    boardingType: {
      type: String,
      enum: ['residential', 'day-boarding'],
      default: 'day-boarding',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
