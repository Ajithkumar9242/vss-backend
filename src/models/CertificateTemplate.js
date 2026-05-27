'use strict';
const mongoose = require('mongoose');

const certificateTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'study',
        'transfer',
        'bonafide',
        'character',
        'conduct',
        'participation',
        'merit',
        'custom',
      ],
      default: 'custom',
    },
    // HTML content with {{variable}} placeholders
    content: {
      type: String,
      required: [true, 'Template content is required'],
    },
    // Header / footer text
    headerText: { type: String, default: '' },
    footerText: { type: String, default: '' },
    // Title shown prominently on the certificate
    title: { type: String, default: '' },
    // Letterhead / logo images (Cloudinary URLs or local URLs)
    letterheadUrl: { type: String, default: null },
    signatureUrl:  { type: String, default: null },
    // Formatting options
    fontFamily: { type: String, default: 'Times New Roman' },
    fontSize:   { type: Number, default: 12 },
    textAlign:  { type: String, enum: ['left', 'center', 'right', 'justify'], default: 'justify' },
    bold:       { type: Boolean, default: false },
    italic:     { type: Boolean, default: false },
    underline:  { type: Boolean, default: false },
    lineHeight: { type: Number, default: 1.8 },
    textColor:  { type: String, default: '#0f172a' },
    // Spacing & Section controls
    spacingBeforeSignature: { type: Number, default: 60 },
    useSchoolLetterhead:    { type: Boolean, default: true },
    showLogo:               { type: Boolean, default: true },
    customLogoUrl:          { type: String, default: null },
    footerAlign:            { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    // Principal details override (optional)
    principalName:        { type: String, default: '' },
    principalDesignation: { type: String, default: 'Principal' },
    // Created by
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
