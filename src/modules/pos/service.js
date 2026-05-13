'use strict';

const AppError       = require('../../utils/AppError');
const CounterService = require('../../utils/counterService');
const PosItemCatalog = require('../../models/PosItemCatalog');
const PosInvoice     = require('../../models/PosInvoice');
const Student        = require('../../models/Student');

class PosService {

  // ═══════════════════════════════════════════════
  //  ITEM CATALOG
  // ═══════════════════════════════════════════════

  static async listCatalog(onlyActive = false) {
    const filter = onlyActive ? { active: true } : {};
    return PosItemCatalog.find(filter).sort({ category: 1, name: 1 }).lean();
  }

  static async createItem(data, userId) {
    const item = await PosItemCatalog.create({ ...data, createdBy: userId });
    return item.toObject();
  }

  static async updateItem(id, data) {
    const item = await PosItemCatalog.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
    if (!item) throw new AppError('POS item not found', 404);
    return item;
  }

  static async toggleItem(id) {
    const item = await PosItemCatalog.findById(id);
    if (!item) throw new AppError('POS item not found', 404);
    item.active = !item.active;
    await item.save();
    return item.toObject();
  }

  // ═══════════════════════════════════════════════
  //  INVOICES
  // ═══════════════════════════════════════════════

  static async createInvoice({ studentId, items, paymentMode, discountTotal, taxTotal, notes, paymentRef, userId }) {
    if (!items || !items.length) throw new AppError('At least one item is required', 400);

    // Compute subtotal from line items
    const processedItems = items.map((item) => {
      const qty       = Math.max(1, Number(item.qty) || 1);
      const unitPrice = Number(item.unitPrice) || 0;
      const discount  = Number(item.discount) || 0;
      const taxPct    = Number(item.taxPercent) || 0;
      const lineBase  = (unitPrice - discount) * qty;
      const lineTax   = lineBase * taxPct / 100;
      const lineTotal = Math.round((lineBase + lineTax) * 100) / 100;
      return { itemId: item.itemId || null, nameSnapshot: item.nameSnapshot, qty, unitPrice, discount, taxPercent: taxPct, lineTotal };
    });

    const subtotal      = Math.round(processedItems.reduce((s, i) => s + i.unitPrice * i.qty, 0) * 100) / 100;
    const discTotal     = Number(discountTotal) || 0;
    const taxTotalVal   = Math.round(processedItems.reduce((s, i) => s + (i.unitPrice - i.discount) * i.qty * i.taxPercent / 100, 0) * 100) / 100;
    const grandTotal    = Math.max(0, Math.round((subtotal - discTotal + taxTotalVal) * 100) / 100);

    // Student snapshot
    let studentSnapshot = { name: '', rollNo: '', className: '' };
    if (studentId) {
      const student = await Student.findById(studentId).populate('classId', 'name').lean();
      if (student) {
        studentSnapshot = {
          name:      student.name,
          rollNo:    student.rollNo,
          className: student.classId?.name || '',
        };
      }
    }

    // Atomic invoice number
    const year = new Date().getFullYear();
    const { formatted } = await CounterService.getNext(`pos-invoice-${year}`, { padLength: 5 });
    const invoiceNumber = `INV-POS-${year}-${formatted}`;

    const invoice = await PosInvoice.create({
      invoiceNumber,
      invoiceType: 'pos',
      studentId:   studentId || null,
      studentSnapshot,
      items:        processedItems,
      subtotal,
      discountTotal: discTotal,
      taxTotal:      taxTotalVal,
      grandTotal,
      paymentMode,
      paymentRef:    paymentRef || null,
      paymentStatus: 'paid',
      status:        'paid',
      notes:         notes || '',
      createdBy:     userId,
      auditLogs: [{
        action:      'Invoice created',
        performedBy: userId,
        performedAt: new Date(),
        meta:        { grandTotal, paymentMode },
      }],
    });

    return invoice.toObject();
  }

  static async listInvoices(filters = {}) {
    const query = {};
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.status)    query.status    = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo)   query.createdAt.$lte = new Date(filters.dateTo + 'T23:59:59');
    }
    return PosInvoice.find(query)
      .populate('studentId', 'name rollNo')
      .sort({ createdAt: -1 })
      .lean();
  }

  static async getInvoice(id) {
    const inv = await PosInvoice.findById(id)
      .populate('studentId', 'name rollNo')
      .populate('createdBy', 'name')
      .lean();
    if (!inv) throw new AppError('Invoice not found', 404);
    return inv;
  }

  static async cancelInvoice({ id, cancelReason, userId }) {
    if (!cancelReason?.trim()) throw new AppError('cancelReason is required', 400);
    const inv = await PosInvoice.findById(id);
    if (!inv) throw new AppError('Invoice not found', 404);
    if (inv.status === 'cancelled') throw new AppError('Invoice is already cancelled', 400);

    inv.status        = 'cancelled';
    inv.paymentStatus = 'cancelled';
    inv.cancelledBy   = userId;
    inv.cancelledAt   = new Date();
    inv.cancelReason  = cancelReason.trim();
    inv.updatedBy     = userId;
    inv.auditLogs.push({ action: 'Invoice cancelled', performedBy: userId, performedAt: new Date(), meta: { cancelReason } });
    await inv.save();
    return inv.toObject();
  }
}

module.exports = PosService;
