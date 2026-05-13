const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema(
  {
    applicationNo: {
      type: String,
      unique: true,
      required: true,
    },
    studentName: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: [true, 'Gender is required'],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },

    // ─── Admission Mode & Type ──────────────────────────────
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

    // ─── Parent / Guardian Info ─────────────────────────────
    parentName: {
      type: String,
      required: [true, 'Parent/Guardian name is required'],
      trim: true,
    },
    fatherName: {
      type: String,
      trim: true,
    },
    motherName: {
      type: String,
      trim: true,
    },
    parentPhone: {
      type: String,
      required: [true, 'Parent phone is required'],
      trim: true,
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

    // ─── Academic Info ──────────────────────────────────────
    previousSchool: {
      type: String,
      trim: true,
    },
    previousBoard: {
      type: String,
      trim: true,
    },
    hasTC: {
      type: Boolean,
      default: false,
    },

    // ─── Medical Info ───────────────────────────────────────
    bloodGroup: {
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

    // ─── Payment (Razorpay) ─────────────────────────────────
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'na'],
      default: 'na',
    },
    paymentId: {
      type: String,
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },

    // ─── Status & Workflow ──────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'hold'],
      default: 'pending',
    },
    remarks: { type: String, trim: true },      // general / approval remark
    holdRemarks: { type: String, trim: true },
    rejectionRemarks: { type: String, trim: true },
    documents: [
      {
        name: { type: String, trim: true },
        url: { type: String },
        publicId: { type: String },
      },
    ],
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    // ─── Extended Student Details ───────────────────────────
    placeOfBirth: { type: String, trim: true },
    dobInWords: { type: String, trim: true },
    nationality: { type: String, trim: true, default: 'Indian' },
    religion: { type: String, trim: true },
    motherTongue: { type: String, trim: true },
    aadhaarNo: { type: String, trim: true },
    caste: { type: String, trim: true },
    category: {
      type: String,
      enum: ['General', 'OBC', 'SC', 'ST', 'Others'],
      default: 'General',
    },
    numberOfSiblings: { type: Number, default: 0 },
    siblingStudyingInSchool: { type: Boolean, default: false },
    siblingClass: { type: String, trim: true },
    secondLanguage: { type: String, trim: true },   // Kannada / Hindi / Other
    secondLanguageOther: { type: String, trim: true },
    boardingType: {
      type: String,
      enum: ['residential', 'day-boarding'],
      default: 'day-boarding',
    },
    studentPhoto: { type: String, trim: true },   // Cloudinary URL

    // ─── Extended Previous School ───────────────────────────
    previousSchoolAddress: { type: String, trim: true },
    previousMedium: { type: String, trim: true },
    previousClass: { type: String, trim: true },
    yearOfCompletion: { type: String, trim: true },
    tcNumber: { type: String, trim: true },
    tcDate: { type: Date },
    satsNumber: { type: String, trim: true },
    apaarNumber: { type: String, trim: true },
    penNumber: { type: String, trim: true },

    // ─── Father Details ─────────────────────────────────────
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

    // ─── Mother Details ─────────────────────────────────────
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

    // ─── Guardian Details ────────────────────────────────────
    guardian: {
      name: { type: String, trim: true },
      relationship: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
    },

    // ─── Edit / Audit History ────────────────────────────────
    editHistory: [{
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      editedAt: { type: Date, default: Date.now },
      changes: { type: mongoose.Schema.Types.Mixed },
    }],

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────
admissionSchema.index({ parentPhone: 1 });
admissionSchema.index({ razorpayOrderId: 1 });
admissionSchema.index({ status: 1 });
admissionSchema.index({ academicYearId: 1, status: 1 });

// ─── Pre-save: CAPS normalize name fields ─────────────────────
const NAME_FIELDS = ['studentName', 'parentName', 'fatherName', 'motherName'];

admissionSchema.pre('save', function () {
  for (const f of NAME_FIELDS) {
    if (this[f] && typeof this[f] === 'string') {
      this[f] = this[f].toUpperCase();
    }
  }

  if (this.father?.name) {
    this.father.name = this.father.name.toUpperCase();
  }

  if (this.mother?.name) {
    this.mother.name = this.mother.name.toUpperCase();
  }

  if (this.guardian?.name) {
    this.guardian.name = this.guardian.name.toUpperCase();
  }
});

// findOneAndUpdate does NOT trigger pre('save')
admissionSchema.pre('findOneAndUpdate', function () {
  const u = this.getUpdate() || {};

  const cap = (obj, key) => {
    if (obj?.[key] && typeof obj[key] === 'string') {
      obj[key] = obj[key].toUpperCase();
    }
  };

  // direct updates
  cap(u, 'studentName');
  cap(u, 'parentName');
  cap(u, 'fatherName');
  cap(u, 'motherName');

  // $set updates
  if (u.$set) {
    cap(u.$set, 'studentName');
    cap(u.$set, 'parentName');
    cap(u.$set, 'fatherName');
    cap(u.$set, 'motherName');

    if (u.$set.father?.name) {
      u.$set.father.name = u.$set.father.name.toUpperCase();
    }

    if (u.$set.mother?.name) {
      u.$set.mother.name = u.$set.mother.name.toUpperCase();
    }

    if (u.$set.guardian?.name) {
      u.$set.guardian.name = u.$set.guardian.name.toUpperCase();
    }
  }

  // nested direct updates
  if (u.father?.name) {
    u.father.name = u.father.name.toUpperCase();
  }

  if (u.mother?.name) {
    u.mother.name = u.mother.name.toUpperCase();
  }

  if (u.guardian?.name) {
    u.guardian.name = u.guardian.name.toUpperCase();
  }

  this.setUpdate(u);
});

module.exports = mongoose.model('Admission', admissionSchema);
