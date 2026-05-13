'use strict';

/**
 * FeesService — clean installment-first fee system.
 * SOURCE OF TRUTH: StudentFeeProfile
 * NO FeeStructure. NO legacy fallbacks. DB is fresh.
 */

const FeePayment        = require('../../models/FeePayment');
const FeeInvoice        = require('../../models/FeeInvoice');
const Student           = require('../../models/Student');
const StudentFeeProfile = require('../../models/StudentFeeProfile');
const AppError          = require('../../utils/AppError');
const mongoose          = require('mongoose');
const ActivityService   = require('../activity/service');
const NotificationService = require('../notification/service');

class FeesService {

  static async getModuleStatus() {
    return { module: 'fees', status: 'Fees module is operational' };
  }

  // ═══════════════════════════════════════════════════════════
  //  NEXT DUE DATE HELPER
  // ═══════════════════════════════════════════════════════════

  /**
   * Find the earliest unpaid installment due date.
   * Used after every payment to advance nextDueDate.
   */
  static _computeNextDueDate(installments) {
    if (!Array.isArray(installments) || !installments.length) return null;
    const unpaid = installments
      .filter(i => i.status !== 'paid' && i.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    return unpaid[0]?.dueDate || null;
  }

  // ═══════════════════════════════════════════════════════════
  //  GET INVOICE (for student / parent portal)
  // ═══════════════════════════════════════════════════════════

  /**
   * Fetch invoice + profile + payments for a student.
   * Returns a structured object so the parent portal can render
   * summary, feeProfile, installments, and payment history.
   */
  static async getInvoice(studentId, academicYearId) {
    const query = { studentId };
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      query.academicYearId = academicYearId;
    }

    const invoice = await FeeInvoice.findOne(query)
      .sort({ createdAt: -1 })
      .populate('studentId', 'name rollNo classId parentName parentPhone admissionNumber')
      .populate('classId', 'name code')
      .populate('academicYearId', 'name')
      .populate('feeProfileId')
      .lean();

    if (!invoice) {
      // No invoice — check for profile (fee assigned but no invoice yet)
      const profile = await StudentFeeProfile.findOne(
        academicYearId && mongoose.isValidObjectId(academicYearId)
          ? { studentId, academicYearId }
          : { studentId }
      ).sort({ createdAt: -1 }).lean();

      return {
        invoice:    null,
        feeProfile: profile || null,
        summary:    profile ? {
          totalFee:  profile.netFee || 0,
          totalPaid: 0,
          totalDue:  profile.netFee || 0,
          status:    'Pending',
          livePenalty: 0,
          daysOverdue: 0,
        } : null,
        payments: [],
        student:  null,
      };
    }

    // Build feeProfile from populated feeProfileId or fetch separately
    let feeProfile = invoice.feeProfileId || null;
    if (!feeProfile || !feeProfile.selectedComponents) {
      feeProfile = await StudentFeeProfile.findOne(
        { studentId: invoice.studentId?._id || studentId }
      ).sort({ createdAt: -1 }).lean();
    }

    // Fetch payments for this invoice
    const payments = await FeePayment.find({ invoiceId: invoice._id })
      .sort({ paidAt: -1 })
      .lean();

    // Build summary
    const grossFee       = invoice.grossFee || invoice.totalAmount || 0;
    const discountAmount = invoice.discountAmount || 0;
    const netFee         = invoice.netFee || Math.max(0, grossFee - discountAmount);
    const paidAmount     = invoice.paidAmount || 0;
    const dueAmount      = invoice.dueAmount  || Math.max(0, netFee - paidAmount);
    const penaltyAmount  = invoice.penaltyAmount || 0;

    const statusMap = { paid: 'Paid', partial: 'Partial', overdue: 'Overdue', unpaid: 'Pending' };
    const status = statusMap[invoice.status] || 'Pending';

    // Compute days overdue from nextDueDate
    let daysOverdue = 0;
    if (invoice.nextDueDate && invoice.status !== 'paid') {
      const diff = Math.floor((Date.now() - new Date(invoice.nextDueDate)) / 86400000);
      if (diff > 0) daysOverdue = diff;
    }

    const summary = {
      totalFee:    netFee,
      totalPaid:   paidAmount,
      totalDue:    dueAmount,
      grossFee,
      discountAmount,
      penaltyAmount,
      status,
      livePenalty: penaltyAmount,
      daysOverdue,
    };

    return { invoice, feeProfile, summary, payments, student: invoice.studentId || null };
  }

  // ═══════════════════════════════════════════════════════════
  //  INVOICE GENERATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate a FeeInvoice from a StudentFeeProfile.
   * Idempotent — returns existing invoice if one exists for this student+year.
   */
  static async generateInvoice({ studentId, classId, academicYearId }) {
    // Idempotency guard
    const existing = await FeeInvoice.findOne({ studentId, academicYearId });
    if (existing) return existing;

    // Load profile — must exist
    const profile = await StudentFeeProfile.findOne({ studentId, academicYearId })
      .sort({ createdAt: -1 });
    if (!profile) {
      throw new AppError(
        'No fee profile found for this student. Please assign fee components first in Fees → Assign Fees.',
        400
      );
    }
    if (!profile.grossFee || profile.grossFee <= 0) {
      throw new AppError('Fee profile has no components. Total fee is ₹0.', 400);
    }

    // ── Schedule validation gate ────────────────────────────────────────────
    // Invoice cannot be generated until admin has set a valid payment schedule.
    if (!profile.installments || profile.installments.length === 0) {
      throw new AppError(
        'Payment schedule is missing. Open Assign Fees → click Sch. to add installments with due dates before generating an invoice.',
        400
      );
    }

    const missingDue = profile.installments.filter(i => !i.dueDate);
    if (missingDue.length > 0) {
      throw new AppError(
        `${missingDue.length} installment(s) are missing a due date. Open Assign Fees → Sch. and set due dates for all installments.`,
        400
      );
    }

    if (profile.scheduleOutOfSync) {
      throw new AppError(
        'The payment schedule is out of sync with the current net fee (a discount may have been applied). ' +
        'Open Assign Fees → Sch., update installment amounts to match ₹' + profile.netFee + ', then save before generating an invoice.',
        400
      );
    }

    const instSum = profile.installments.reduce((s, i) => s + (i.amount || 0), 0);
    if (Math.abs(instSum - profile.netFee) > 1) {
      throw new AppError(
        `Installment total (₹${instSum}) does not match net fee (₹${profile.netFee}). Adjust the schedule and save.`,
        400
      );
    }
    // ──────────────────────────────────────────────────────────────────────────────

    const now = new Date();

    // Build installments from profile schedule
    const installments = (profile.installments || []).map((inst, i) => {
      const isOverdue = inst.dueDate && new Date(inst.dueDate) < now;
      return {
        installmentNo: inst.installmentNo || i + 1,
        label:         inst.label,
        amount:        inst.amount,
        dueDate:       inst.dueDate || null,
        paidAmount:    0,
        balanceAmount: inst.amount,
        status:        isOverdue ? 'overdue' : 'pending',
      };
    });

    const nextDueDate = FeesService._computeNextDueDate(installments);

    const invoice = await FeeInvoice.create({
      studentId,
      classId,
      academicYearId:  academicYearId || null,
      feeProfileId:    profile._id,
      installments,
      grossFee:        profile.grossFee,
      discountAmount:  profile.discountAmt,
      netFee:          profile.netFee,
      paidAmount:      0,
      dueAmount:       profile.netFee,
      status:          'unpaid',
      nextDueDate,
      penaltyConfig:   profile.penaltyConfig,
    });

    ActivityService.log({
      studentId,
      action: `Invoice ${invoice.invoiceNumber} generated`,
      module: 'fee',
      metadata: { invoiceId: invoice._id, grossFee: profile.grossFee, netFee: profile.netFee },
    }).catch(() => {});

    return invoice;
  }

  // ═══════════════════════════════════════════════════════════
  //  GET INVOICE
  // ═══════════════════════════════════════════════════════════

  static async getInvoice(studentId, academicYearId) {
    const query = { studentId };
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      query.academicYearId = academicYearId;
    }
    return FeeInvoice.findOne(query)
      .populate('feeProfileId')
      .populate('classId', 'name')
      .populate('academicYearId', 'name')
      .sort({ createdAt: -1 });
  }

  // ═══════════════════════════════════════════════════════════
  //  INSTALLMENT PAYMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Record a payment against a specific installment (or auto-select first unpaid).
   * Distributes payment across installments in chronological order.
   */
  static async recordInstallmentPayment({ invoiceId, installmentId, amount, paymentMode, transactionId, userId }) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.locked) throw new AppError('Invoice is locked. Cannot record payment.', 403);
    if (invoice.status === 'paid') throw new AppError('Invoice is already fully paid.', 400);

    // Guard: invoice must have a payment schedule
    if (!invoice.installments || invoice.installments.length === 0) {
      throw new AppError(
        'This invoice has no payment schedule. Regenerate the schedule from the invoice detail page after setting installments in Assign Fees.',
        400
      );
    }
    if (!invoice.nextDueDate) {
      throw new AppError(
        'No due date is set on this invoice. Ensure all installments have due dates and regenerate the schedule.',
        400
      );
    }

    // Validate amount ≤ dueAmount
    if (amount > invoice.dueAmount + 0.01) {
      throw new AppError(`Cannot overpay. Balance due: ₹${invoice.dueAmount}`, 400);
    }

    // Determine target installment
    let targetInst = null;
    if (installmentId) {
      targetInst = invoice.installments.id(installmentId);
      if (!targetInst) throw new AppError('Installment not found in this invoice', 404);
      if (targetInst.status === 'paid') throw new AppError('Installment is already fully paid', 400);
      const remaining = (targetInst.amount || 0) - (targetInst.paidAmount || 0);
      if (amount > remaining + 0.01) {
        throw new AppError(`Amount exceeds installment balance of ₹${remaining}`, 400);
      }
    } else {
      // Auto-distribute to earliest unpaid installments in order
      targetInst = invoice.installments
        .filter(i => i.status !== 'paid')
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
          return (a.installmentNo || 0) - (b.installmentNo || 0);
        })[0] || null;
    }

    // Create payment record
    const student = await Student.findById(invoice.studentId);
    const payment = await FeePayment.create({
      studentId:     invoice.studentId,
      amount,
      paymentMode,
      transactionId: transactionId || null,
      invoiceId:     invoice._id,
      installmentId: targetInst?._id || null,
      installmentNo: targetInst?.installmentNo || null,
      collectedBy:   userId || null,
      status:        'approved',
      paidAt:        new Date(),
    });

    // Distribute payment across installments (auto-distribute if no specific target)
    let remaining = amount;
    const sortedInsts = invoice.installments
      .filter(i => i.status !== 'paid')
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        return (a.installmentNo || 0) - (b.installmentNo || 0);
      });

    // If targeting a specific installment, only apply to that one
    const instsToApply = targetInst
      ? [targetInst]
      : sortedInsts;

    for (const inst of instsToApply) {
      if (remaining <= 0) break;
      const instBalance = (inst.amount || 0) - (inst.paidAmount || 0);
      if (instBalance <= 0) continue;

      const payToInst = Math.min(remaining, instBalance);
      inst.paidAmount    = (inst.paidAmount || 0) + payToInst;
      inst.balanceAmount = Math.max(0, (inst.amount || 0) - inst.paidAmount);
      inst.paidAt        = new Date();
      inst.paymentMode   = paymentMode;
      inst.receiptNumber = payment.receiptNumber;
      inst.collectedBy   = userId || null;
      inst.transactionId = transactionId || null;
      inst.status        = inst.paidAmount >= inst.amount ? 'paid' : 'partial';
      remaining -= payToInst;
    }

    // Update invoice totals
    invoice.paidAmount  = (invoice.paidAmount || 0) + amount;
    invoice.nextDueDate = FeesService._computeNextDueDate(invoice.installments);
    await invoice.save(); // pre-save hook recalculates dueAmount, netFee, status

    // Notify parent (non-blocking)
    FeesService._notifyPayment(student, invoice.studentId, amount, payment.receiptNumber);

    // Activity log
    ActivityService.log({
      studentId: invoice.studentId,
      action:    `Fee payment of ₹${amount} via ${paymentMode} recorded. Receipt: ${payment.receiptNumber}`,
      module:    'fee',
      metadata:  { invoiceId, amount, paymentMode, receiptNumber: payment.receiptNumber },
    }).catch(() => {});

    return { payment, invoice };
  }

  // ═══════════════════════════════════════════════════════════
  //  PENALTY ENGINE
  // ═══════════════════════════════════════════════════════════

  static async applyPenalty(invoiceId, { type, value }, userId) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.locked) throw new AppError('Invoice is locked.', 403);
    if (invoice.status === 'paid') throw new AppError('Invoice is fully paid. No penalty applicable.', 400);

    let penaltyAmt = 0;
    if (type === 'percent') {
      penaltyAmt = Math.round((invoice.dueAmount * value) / 100);
    } else {
      penaltyAmt = value || 0;
    }
    if (penaltyAmt <= 0) throw new AppError('Penalty amount must be greater than ₹0', 400);

    invoice.penaltyAmount = (invoice.penaltyAmount || 0) + penaltyAmt;
    await invoice.save();

    ActivityService.log({
      studentId: invoice.studentId,
      action:    `Penalty of ₹${penaltyAmt} applied to invoice ${invoice.invoiceNumber}`,
      module:    'fee',
      metadata:  { invoiceId, penaltyAmt, userId },
    }).catch(() => {});

    return invoice;
  }

  static async waivePenalty(invoiceId, { waiveAmount, reason }, userId) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (!invoice.penaltyAmount || invoice.penaltyAmount <= 0) {
      throw new AppError('No penalty to waive on this invoice', 400);
    }

    const toWaive = Math.min(waiveAmount || invoice.penaltyAmount, invoice.penaltyAmount);
    invoice.penaltyAmount -= toWaive;
    invoice.waivedAmount  = (invoice.waivedAmount || 0) + toWaive;
    invoice.waivedBy      = userId;
    invoice.waivedReason  = reason || '';
    invoice.waivedAt      = new Date();
    await invoice.save();

    ActivityService.log({
      studentId: invoice.studentId,
      action:    `Penalty of ₹${toWaive} waived on invoice ${invoice.invoiceNumber}. Reason: ${reason || 'N/A'}`,
      module:    'fee',
      metadata:  { invoiceId, toWaive, reason, userId },
    }).catch(() => {});

    return invoice;
  }

  // ═══════════════════════════════════════════════════════════
  //  INVOICE LOCKING
  // ═══════════════════════════════════════════════════════════

  static async lockInvoice(invoiceId, userId) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.locked) throw new AppError('Invoice is already locked', 400);
    invoice.locked   = true;
    invoice.lockedAt = new Date();
    invoice.lockedBy = userId;
    await invoice.save();
    return invoice;
  }

  static async unlockInvoice(invoiceId, userId) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (!invoice.locked) throw new AppError('Invoice is not locked', 400);
    invoice.locked     = false;
    invoice.unlockedAt = new Date();
    invoice.unlockedBy = userId;
    await invoice.save();
    return invoice;
  }

  // ═══════════════════════════════════════════════════════════
  //  REGENERATE SCHEDULE
  // ═══════════════════════════════════════════════════════════

  /**
   * Re-sync invoice installments from the StudentFeeProfile.
   * Preserves already-paid amounts by matching installmentNo (then label).
   */
  static async regenerateSchedule(invoiceId, userId) {
    const invoice = await FeeInvoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.locked) throw new AppError('Invoice is locked. Cannot regenerate schedule.', 403);

    const profile = await StudentFeeProfile.findOne({
      studentId:      invoice.studentId,
      academicYearId: invoice.academicYearId,
    }).sort({ createdAt: -1 });

    if (!profile) {
      throw new AppError('No fee profile found. Assign fee components first.', 400);
    }
    if (!profile.installments || profile.installments.length === 0) {
      throw new AppError('Fee profile has no installment schedule defined.', 400);
    }

    // Preserve paid amounts by index and by label
    const paidByIndex = new Map();
    const paidByLabel = new Map();
    (invoice.installments || []).forEach((inst, i) => {
      if ((inst.paidAmount || 0) > 0) {
        paidByIndex.set(i, inst);
        paidByLabel.set((inst.label || '').trim().toLowerCase(), inst);
      }
    });

    const now = new Date();
    const newInstallments = profile.installments.map((inst, i) => {
      const labelKey = (inst.label || '').trim().toLowerCase();
      const prev = paidByIndex.get(i) || paidByLabel.get(labelKey);
      const paidAmt = prev?.paidAmount || 0;
      const isOverdue = inst.dueDate && new Date(inst.dueDate) < now && paidAmt < inst.amount;

      return {
        installmentNo: inst.installmentNo || i + 1,
        label:         inst.label,
        amount:        inst.amount,
        dueDate:       inst.dueDate || null,
        paidAmount:    paidAmt,
        balanceAmount: Math.max(0, inst.amount - paidAmt),
        paidAt:        prev?.paidAt || null,
        paymentMode:   prev?.paymentMode || null,
        receiptNumber: prev?.receiptNumber || null,
        collectedBy:   prev?.collectedBy || null,
        status:        paidAmt >= inst.amount ? 'paid'
                     : paidAmt > 0           ? 'partial'
                     : isOverdue             ? 'overdue'
                     :                         'pending',
      };
    });

    invoice.installments   = newInstallments;
    invoice.grossFee       = profile.grossFee;
    invoice.discountAmount = profile.discountAmt;
    invoice.netFee         = profile.netFee;
    invoice.feeProfileId   = profile._id;
    invoice.penaltyConfig  = profile.penaltyConfig;
    invoice.nextDueDate    = FeesService._computeNextDueDate(newInstallments);

    // Recompute paidAmount from installments
    invoice.paidAmount = newInstallments.reduce((s, i) => s + (i.paidAmount || 0), 0);

    await invoice.save();

    ActivityService.log({
      studentId: invoice.studentId,
      action:    `Payment schedule regenerated for invoice ${invoice.invoiceNumber}`,
      module:    'fee',
      metadata:  { invoiceId, userId },
    }).catch(() => {});

    return invoice;
  }

  // ═══════════════════════════════════════════════════════════
  //  FEE OVERVIEW (for main fees table)
  // ═══════════════════════════════════════════════════════════

  static async getFeeOverview(filters = {}) {
    const studentQuery = { isActive: true };
    if (filters.classId && mongoose.isValidObjectId(filters.classId)) {
      studentQuery.classId = filters.classId;
    }

    const students = await Student.find(studentQuery)
      .populate('classId', 'name code')
      .sort({ name: 1 })
      .lean();

    if (!students.length) return [];

    const studentIds = students.map(s => s._id);

    // Load invoices
    const invoices = await FeeInvoice.find({ studentId: { $in: studentIds } }).lean();
    const invoiceMap = {};
    for (const inv of invoices) invoiceMap[inv.studentId.toString()] = inv;

    // Load profiles (for students without invoices — show assigned fee totals)
    const profiles = await StudentFeeProfile.find({ studentId: { $in: studentIds } }).lean();
    const profileMap = {};
    for (const p of profiles) profileMap[p.studentId.toString()] = p;

    const PenaltyEngine = require('../../utils/penaltyEngine');

    return students.map(student => {
      const inv     = invoiceMap[student._id.toString()];
      const profile = profileMap[student._id.toString()];

      let grossFee, discountAmount, netFee, paidAmount, dueAmount, status, livePenalty = 0;

      if (inv) {
        grossFee       = inv.grossFee || inv.totalAmount || 0;
        discountAmount = inv.discountAmount || 0;
        netFee         = inv.netFee || Math.max(0, grossFee - discountAmount);
        paidAmount     = inv.paidAmount || 0;
        dueAmount      = inv.dueAmount || 0;
        status         = inv.status === 'paid'    ? 'Paid'
                       : inv.status === 'partial' ? 'Partial'
                       : inv.status === 'overdue' ? 'Overdue'
                       :                            'Pending';
        // Compute live penalty
        const penaltySummary = PenaltyEngine.computeInvoicePenalty(inv, null);
        livePenalty = Math.max(penaltySummary.totalPenalty, inv.penaltyAmount || 0);
      } else if (profile) {
        grossFee       = profile.grossFee || 0;
        discountAmount = profile.discountAmt || 0;
        netFee         = profile.netFee || 0;
        paidAmount     = 0;
        dueAmount      = netFee;
        status         = 'No Invoice';
      } else {
        grossFee = discountAmount = netFee = paidAmount = dueAmount = 0;
        status   = 'No Profile';
      }

      return {
        _id:           student._id,
        name:          student.name,
        rollNo:        student.rollNo,
        className:     student.classId?.name || '—',
        classId:       student.classId?._id,
        invoiceId:     inv?._id || null,
        invoiceNumber: inv?.invoiceNumber || null,
        grossFee,
        discountAmount,
        netFee,
        totalFee:      netFee, // alias
        paidAmount,
        totalPaid:     paidAmount, // alias
        dueAmount,
        totalDue:      dueAmount, // alias
        livePenalty,
        status,
        nextDueDate:   inv?.nextDueDate || null,
        hasProfile:    !!profile,
        profileId:     profile?._id || null,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════

  static _notifyPayment(student, studentId, amount, receiptNumber) {
    if (!student?.parentId) return;
    const Parent = require('../../models/Parent');
    Parent.findById(student.parentId).then(parent => {
      if (!parent?.userId) return;
      NotificationService.create(parent.userId, {
        title:    'Fee Payment Received',
        message:  `₹${amount} paid for ${student?.name || 'student'}. Receipt: ${receiptNumber}`,
        type:     'info',
        metadata: { studentId, amount, receiptNumber },
      });
    }).catch(() => {});
  }
}

module.exports = FeesService;
