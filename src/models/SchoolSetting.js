const mongoose = require('mongoose');

// Only one record should exist — singleton pattern enforced in service
const schoolSettingSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    boardType: { type: String, enum: ['CBSE', 'ICSE', 'STATE', 'IB', 'OTHER'], default: 'CBSE' },
    registrationNo: { type: String, trim: true },
    affiliationNumber: { type: String, trim: true },
    establishedYear: { type: Number },
    // Principal sub-object (preferred) + legacy flat fields
    principal: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    // Legacy flat fields (kept for backward compat)
    principalName: { type: String, trim: true },
    principalContact: { type: String, trim: true },
    // Contact sub-object (preferred) + legacy flat fields
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true },
    },
    // Legacy flat fields (backward compat)
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    socialLinks: [{ platform: String, url: String }],

    // ─── Admission Control ────────────────────────────────────
    admissionsOpen: { type: Boolean, default: false },
    activeAdmissionAcademicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SchoolSetting', schoolSettingSchema);
