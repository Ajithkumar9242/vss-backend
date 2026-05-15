'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const AppError = require('../../utils/AppError');
const CounterService = require('../../utils/counterService');
const { uploadToCloudinary } = require('../../utils/fileUpload');
const { authorizeFileDownload, resolveStudentForParent } = require('../../utils/vaultGuard');

const DocumentCatalog = require('../../models/DocumentCatalog');
const StudentDocumentRequest = require('../../models/StudentDocumentRequest');
const StudentVaultFile = require('../../models/StudentVaultFile');
const VaultPaymentLedger = require('../../models/VaultPaymentLedger');
const Student = require('../../models/Student');

const normalizeVaultPdfFile = (file) => {
  if (!file) return file;

  const url = file.fileUrl || '';
  const isPdfUrl = /\.pdf(?:\?|$)/i.test(url);

  if (isPdfUrl && url.includes('/image/upload/')) {
    file.fileUrl = url.replace('/image/upload/', '/raw/upload/');
  }

  if (!file.mimeType && isPdfUrl) {
    file.mimeType = 'application/pdf';
  }

  if (!file.originalName && isPdfUrl) {
    file.originalName = 'vault-file.pdf';
  }

  return file;
};

class VaultService {

  // ═══════════════════════════════════════════════
  //  CATALOG
  // ═══════════════════════════════════════════════

  static async listCatalog(onlyActive = false) {
    const filter = onlyActive ? { active: true } : {};
    return DocumentCatalog.find(filter).sort({ category: 1, name: 1 }).lean();
  }

  static async createCatalogItem(data, userId) {
    const item = await DocumentCatalog.create({ ...data, createdBy: userId });
    return item.toObject();
  }

  static async updateCatalogItem(id, data) {
    const item = await DocumentCatalog.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    if (!item) throw new AppError('Catalog item not found', 404);
    return item;
  }

  static async toggleCatalogItem(id) {
    const item = await DocumentCatalog.findById(id);
    if (!item) throw new AppError('Catalog item not found', 404);
    item.active = !item.active;
    await item.save();
    return item.toObject();
  }

  // ═══════════════════════════════════════════════
  //  REQUESTS
  // ═══════════════════════════════════════════════

  static async createRequest({ studentId, catalogItemId, copies, parentNotes, parentUserId, academicYearId }) {
    const catalogItem = await DocumentCatalog.findById(catalogItemId).lean();
    if (!catalogItem) throw new AppError('Catalog item not found', 404);
    if (!catalogItem.active) throw new AppError('This document type is not currently available', 400);

    const copiesNum = Math.max(1, Number(copies) || 1);
    const amount = catalogItem.price * copiesNum;
    const netAmount = amount;

    const { formatted: requestNumber } = await CounterService.getNext('vault-request', { padLength: 5, yearLabel: new Date().getFullYear().toString() });

    const request = await StudentDocumentRequest.create({
      requestNumber: `REQ-${requestNumber}`,
      studentId,
      parentUserId,
      catalogItemId,
      academicYearId: academicYearId || null,
      copies: copiesNum,
      amount,
      discount: 0,
      netAmount,
      parentNotes: parentNotes || '',
      paymentStatus: 'unpaid',
      requestStatus: 'requested',
      createdBy: parentUserId,
      auditLogs: [{ action: 'Request created', performedBy: parentUserId, performedAt: new Date(), meta: { copies: copiesNum, amount } }],
    });

    return request.toObject();
  }

  static async listRequests(filters = {}) {
    const query = {};
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    if (filters.requestStatus) query.requestStatus = filters.requestStatus;

    return StudentDocumentRequest.find(query)
      .populate('studentId', 'name rollNo')
      .populate('catalogItemId', 'name code price category')
      .populate('parentUserId', 'name phone')
      .sort({ createdAt: -1 })
      .lean();
  }

  static async listMyRequests(studentId) {
    return StudentDocumentRequest.find({ studentId, deleted: { $ne: true } })
      .populate('catalogItemId', 'name code category price')
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── Payment: Razorpay order ──────────────────────────────

  static async createRazorpayOrder(requestId, parentUserId) {
    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (request.parentUserId.toString() !== parentUserId.toString()) throw new AppError('Access denied', 403);
    if (request.paymentStatus === 'paid') throw new AppError('Request is already paid', 400);

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new AppError('Razorpay not configured', 500);
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const amountPaise = Math.round(request.netAmount * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `vault_${request._id}`,
      notes: { requestId: request._id.toString(), requestNumber: request.requestNumber },
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID };
  }

  // ── Payment: Confirm (verify signature → mark paid) ──────

  static async confirmRazorpayPayment({ requestId, razorpay_order_id, razorpay_payment_id, razorpay_signature, parentUserId }) {
    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (request.parentUserId.toString() !== parentUserId.toString()) throw new AppError('Access denied', 403);
    if (request.paymentStatus === 'paid') throw new AppError('Request is already paid', 400);

    // Real Razorpay HMAC-SHA256 signature verification
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new AppError('Razorpay secret not configured', 500);

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      throw new AppError('Payment verification failed: invalid signature', 400);
    }

    // Create immutable ledger entry FIRST
    await VaultPaymentLedger.create({
      requestId: request._id,
      studentId: request.studentId,
      amount: request.netAmount,
      mode: 'razorpay',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      performedBy: parentUserId,
      verifiedAt: new Date(),
    });

    // Now mark paid (only after ledger is written)
    request.paymentStatus = 'paid';
    request.paymentMode = 'razorpay';
    request.auditLogs.push({ action: 'Payment confirmed (Razorpay)', performedBy: parentUserId, performedAt: new Date(), meta: { razorpay_payment_id, amount: request.netAmount } });
    await request.save();

    return request.toObject();
  }

  // ── Payment: Admin cash override (super_admin ONLY) ──────

  static async adminMarkPaid({ requestId, overrideReason, adminUserId }) {
    if (!overrideReason?.trim()) throw new AppError('overrideReason is required for cash override', 400);

    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (request.paymentStatus === 'paid') throw new AppError('Request is already paid', 400);

    await VaultPaymentLedger.create({
      requestId: request._id,
      studentId: request.studentId,
      amount: request.netAmount,
      mode: 'cash',
      adminOverride: true,
      overrideReason: overrideReason.trim(),
      performedBy: adminUserId,
      verifiedAt: new Date(),
    });

    request.paymentStatus = 'paid';
    request.paymentMode = 'cash';
    request.auditLogs.push({ action: 'Payment marked paid (admin cash override)', performedBy: adminUserId, performedAt: new Date(), meta: { overrideReason, amount: request.netAmount } });
    await request.save();

    return request.toObject();
  }

  // ── Approve ──────────────────────────────────────────────

  static async approveRequest({ requestId, adminNotes, adminUserId }) {
    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (request.paymentStatus !== 'paid') throw new AppError('Cannot approve: request must be paid first', 400);
    if (request.requestStatus !== 'requested') throw new AppError(`Request is already ${request.requestStatus}`, 400);

    request.requestStatus = 'approved';
    request.adminNotes = adminNotes || '';
    request.approvedBy = adminUserId;
    request.approvedAt = new Date();
    request.auditLogs.push({ action: 'Request approved', performedBy: adminUserId, performedAt: new Date(), meta: { adminNotes } });
    await request.save();

    return request.toObject();
  }

  // ── Reject ───────────────────────────────────────────────

  static async rejectRequest({ requestId, adminNotes, adminUserId }) {
    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (['fulfilled', 'rejected'].includes(request.requestStatus)) throw new AppError(`Request is already ${request.requestStatus}`, 400);

    request.requestStatus = 'rejected';
    request.adminNotes = adminNotes || '';
    request.rejectedBy = adminUserId;
    request.rejectedAt = new Date();
    request.auditLogs.push({ action: 'Request rejected', performedBy: adminUserId, performedAt: new Date(), meta: { adminNotes } });
    await request.save();

    return request.toObject();
  }

  // ── Fulfill ──────────────────────────────────────────────

  static async fulfillRequest({ requestId, vaultFileId, adminUserId }) {
    const request = await StudentDocumentRequest.findById(requestId);
    if (!request) throw new AppError('Request not found', 404);
    if (request.requestStatus !== 'approved') throw new AppError('Request must be approved before fulfillment', 400);

    request.requestStatus = 'fulfilled';
    request.linkedVaultFileId = vaultFileId;
    request.fulfilledBy = adminUserId;
    request.fulfilledAt = new Date();
    request.auditLogs.push({ action: 'Request fulfilled', performedBy: adminUserId, performedAt: new Date(), meta: { vaultFileId } });
    await request.save();

    return request.toObject();
  }

  // ═══════════════════════════════════════════════
  //  VAULT FILES
  // ═══════════════════════════════════════════════

  static async uploadFile({ file, studentId, title, description, catalogItemId, requestId, visibleToParent, requiresApprovedRequest, tags, issueDate, adminUserId }) {
    if (!file) throw new AppError('File is required', 400);

    const result = await uploadToCloudinary(file, `vms-erp/vault/${studentId}`);

    const vaultFile = await StudentVaultFile.create({
      studentId,
      catalogItemId: catalogItemId || null,
      requestId: requestId || null,
      title,
      description: description || '',
      storageProvider: 'cloudinary',
      fileUrl: result.url,
      publicId: result.publicId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      issueDate: issueDate || null,
      visibleToParent: visibleToParent === true || visibleToParent === 'true',
      requiresApprovedRequest: requiresApprovedRequest === true || requiresApprovedRequest === 'true',
      approvedRequestId: requestId || null,
      uploadedBy: adminUserId,
    });

    return vaultFile.toObject();
  }

  static async listStudentFiles(studentId) {
    const files = await StudentVaultFile.find({ studentId, deleted: { $ne: true } })
      .populate('catalogItemId', 'name code')
      .populate('requestId', 'requestNumber requestStatus')
      .sort({ createdAt: -1 })
      .lean();
    return files.map(normalizeVaultPdfFile);
  }

  static async softDeleteFile(fileId, adminUserId) {
    const file = await StudentVaultFile.findById(fileId);
    if (!file) throw new AppError('File not found', 404);
    file.deleted = true;
    file.deletedAt = new Date();
    file.deletedBy = adminUserId;
    await file.save();
    return { deleted: true };
  }

  static async listMyFiles(studentId) {
    return StudentVaultFile.find({
      studentId,
      deleted: { $ne: true },
      visibleToParent: true,
    })
      .populate('catalogItemId', 'name code category')
      .populate('requestId', 'requestNumber requestStatus paymentStatus')
      .sort({ createdAt: -1 })
      .select('-fileUrl -publicId') // Never expose raw storage fields to parent
      .lean();
  }

  static async streamFile(fileId, req) {
    const file = await StudentVaultFile.findById(fileId).lean();
    if (!file || file.deleted) throw new AppError('File not found', 404);

    await authorizeFileDownload(req, file);

    // Proxy stream from Cloudinary (never return raw URL to client)
    normalizeVaultPdfFile(file);
    return { fileUrl: file.fileUrl, originalName: file.originalName, mimeType: file.mimeType };
  }

  static async getDownloadableFile(user, fileId) {
    const StudentVaultFile = require('../../models/StudentVaultFile');
    const vaultGuard = require('../../utils/vaultGuard');
    const AppError = require('../../utils/AppError');

    const file = await StudentVaultFile.findById(fileId);

    if (!file || file.deleted) {
      throw new AppError('File not found', 404);
    }

    // Parent validation
    if (user.role === 'parent') {
      await vaultGuard.authorizeFileDownload(
        { user },
        file
      );
    }

    return normalizeVaultPdfFile(file);
  }
}



module.exports = VaultService;
