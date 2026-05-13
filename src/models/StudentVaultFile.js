'use strict';
const mongoose = require('mongoose');

const studentVaultFileSchema = new mongoose.Schema(
  {
    studentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    catalogItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCatalog', default: null },
    requestId:     { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocumentRequest', default: null },

    title:       { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // Storage
    storageProvider: { type: String, enum: ['cloudinary', 'local'], default: 'cloudinary' },
    fileUrl:         { type: String, required: true },   // Cloudinary URL or local path — NEVER returned to parent
    publicId:        { type: String, default: null },    // Cloudinary publicId — NEVER returned to parent
    originalName:    { type: String, trim: true },
    mimeType:        { type: String, trim: true },
    fileSize:        { type: Number, default: 0 },

    // Metadata
    tags:       [{ type: String, trim: true }],
    issueDate:  { type: Date, default: null },
    expiryDate: { type: Date, default: null },

    // Access control
    visibleToParent:         { type: Boolean, default: false },
    requiresApprovedRequest: { type: Boolean, default: false },
    approvedRequestId:       { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocumentRequest', default: null },

    // Soft delete
    deleted:   { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

studentVaultFileSchema.index({ studentId: 1, deleted: 1, createdAt: -1 });
studentVaultFileSchema.index({ requestId: 1 });

module.exports = mongoose.model('StudentVaultFile', studentVaultFileSchema);
