'use strict';

const AppError    = require('../../utils/AppError');
const FeeInvoice  = require('../../models/FeeInvoice');
const PosInvoice  = require('../../models/PosInvoice');
const StudentDocumentRequest = require('../../models/StudentDocumentRequest');

class RegistryService {

  /**
   * Unified invoice list across Fee, POS, and Vault request invoices.
   */
  static async list(filters = {}) {
    const { type, studentId, status, dateFrom, dateTo, page = 1, limit = 50 } = filters;
    const skip = (Number(page) - 1) * Number(limit);

    const results = [];

    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo)   dateFilter.$lte = new Date(dateTo + 'T23:59:59');

    // ── Fees ──────────────────────────────────────────────
    if (!type || type === 'fees') {
      const feeQuery = {};
      if (studentId)           feeQuery.studentId = studentId;
      if (status)              feeQuery.status    = status;
      if (dateFrom || dateTo)  feeQuery.createdAt = dateFilter;

      const fees = await FeeInvoice.find(feeQuery)
        .populate('studentId', 'name rollNo')
        .sort({ createdAt: -1 }).limit(200).lean();

      fees.forEach((f) => results.push({
        _id:           f._id,
        type:          'fees',
        invoiceNumber: f.invoiceNumber || `FEE-${f._id.toString().slice(-6).toUpperCase()}`,
        studentName:   f.studentId?.name || '—',
        studentId:     f.studentId?._id || f.studentId,
        amount:        f.netFee,
        paidAmount:    f.paidAmount,
        status:        f.status,
        createdAt:     f.createdAt,
        locked:        f.locked || false,
        canCancel:     false, // Fee invoices never cancelled via registry
      }));
    }

    // ── POS ───────────────────────────────────────────────
    if (!type || type === 'pos') {
      const posQuery = {};
      if (studentId)           posQuery.studentId = studentId;
      if (status)              posQuery.status    = status;
      if (dateFrom || dateTo)  posQuery.createdAt = dateFilter;

      const posInvs = await PosInvoice.find(posQuery)
        .populate('studentId', 'name rollNo')
        .sort({ createdAt: -1 }).limit(200).lean();

      posInvs.forEach((p) => results.push({
        _id:           p._id,
        type:          'pos',
        invoiceNumber: p.invoiceNumber,
        studentName:   p.studentSnapshot?.name || p.studentId?.name || '—',
        studentId:     p.studentId,
        amount:        p.grandTotal,
        paidAmount:    p.status === 'paid' ? p.grandTotal : 0,
        status:        p.status,
        createdAt:     p.createdAt,
        locked:        false,
        canCancel:     p.status !== 'cancelled',
      }));
    }

    // ── Vault Requests (paid) ─────────────────────────────
    if (!type || type === 'vault') {
      const vaultQuery = { paymentStatus: 'paid' };
      if (studentId)           vaultQuery.studentId = studentId;
      if (dateFrom || dateTo)  vaultQuery.createdAt = dateFilter;

      const reqs = await StudentDocumentRequest.find(vaultQuery)
        .populate('studentId', 'name rollNo')
        .populate('catalogItemId', 'name')
        .sort({ createdAt: -1 }).limit(200).lean();

      reqs.forEach((r) => results.push({
        _id:           r._id,
        type:          'vault',
        invoiceNumber: r.requestNumber || `REQ-${r._id.toString().slice(-6).toUpperCase()}`,
        studentName:   r.studentId?.name || '—',
        studentId:     r.studentId?._id || r.studentId,
        amount:        r.netAmount,
        paidAmount:    r.paymentStatus === 'paid' ? r.netAmount : 0,
        status:        r.requestStatus,
        createdAt:     r.createdAt,
        locked:        false,
        canCancel:     false, // Vault requests not cancelled via registry
        description:   r.catalogItemId?.name,
      }));
    }

    // Sort unified list by date desc
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = results.length;
    const paged = results.slice(skip, skip + Number(limit));

    return { data: paged, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Get detail of a single invoice (delegates to respective model).
   */
  static async getDetail(id, type) {
    if (type === 'fees') {
      const inv = await FeeInvoice.findById(id).populate('studentId', 'name rollNo').lean();
      if (!inv) throw new AppError('Fee invoice not found', 404);
      return { type: 'fees', data: inv };
    }
    if (type === 'pos') {
      const inv = await PosInvoice.findById(id).populate('studentId', 'name rollNo').lean();
      if (!inv) throw new AppError('POS invoice not found', 404);
      return { type: 'pos', data: inv };
    }
    if (type === 'vault') {
      const req = await StudentDocumentRequest.findById(id)
        .populate('studentId', 'name rollNo').populate('catalogItemId', 'name').lean();
      if (!req) throw new AppError('Document request not found', 404);
      return { type: 'vault', data: req };
    }
    throw new AppError('type must be fees, pos, or vault', 400);
  }

  /**
   * Cancel a POS invoice from the registry.
   * Fee and vault types are blocked here.
   */
  static async cancelInvoice(id, type, cancelReason, userId) {
    if (type === 'fees')  throw new AppError('Fee invoices cannot be cancelled from Invoice Registry. Use the Fees module.', 400);
    if (type === 'vault') throw new AppError('Vault requests cannot be cancelled from Invoice Registry.', 400);

    const PosService = require('../pos/service');
    return PosService.cancelInvoice({ id, cancelReason, userId });
  }

  /**
   * Get audit logs for a POS invoice or vault request.
   */
  static async getAuditLogs(id, type) {
    if (type === 'pos') {
      const inv = await PosInvoice.findById(id).lean();
      if (!inv) throw new AppError('POS invoice not found', 404);
      return inv.auditLogs || [];
    }
    if (type === 'vault') {
      const req = await StudentDocumentRequest.findById(id).lean();
      if (!req) throw new AppError('Vault request not found', 404);
      return req.auditLogs || [];
    }
    if (type === 'fees') {
      return [{ action: 'Audit logs for fee invoices are in the Fees module.' }];
    }
    throw new AppError('type must be fees, pos, or vault', 400);
  }
}

module.exports = RegistryService;
