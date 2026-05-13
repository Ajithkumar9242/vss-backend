'use strict';

const FeesService         = require('./service');
const FeeComponentService = require('./componentService');
const ProfileService      = require('./profileService');
const AnalyticsService    = require('./analyticsService');
const ApiResponse         = require('../../utils/apiResponse');

/**
 * FeesController — handles HTTP request/response.
 * Delegates all business logic to respective services.
 */
class FeesController {

  // ─── Health ───────────────────────────────────────────────
  static async health(req, res, next) {
    try {
      const data = await FeesService.getModuleStatus();
      return ApiResponse.success(res, data, 'Fees module operational');
    } catch (error) { next(error); }
  }

  // ═══════════════════════════════════════════════════════════
  //  FEE COMPONENTS
  // ═══════════════════════════════════════════════════════════

  static async getComponents(req, res, next) {
    try {
      const components = await FeeComponentService.getAll(req.query);
      return ApiResponse.success(res, components, 'Fee components fetched');
    } catch (error) { next(error); }
  }

  static async getComponent(req, res, next) {
    try {
      const component = await FeeComponentService.getById(req.params.id);
      return ApiResponse.success(res, component, 'Fee component fetched');
    } catch (error) { next(error); }
  }

  static async createComponent(req, res, next) {
    try {
      const component = await FeeComponentService.create(req.body, req.user._id);
      return ApiResponse.created(res, component, 'Fee component created');
    } catch (error) { next(error); }
  }

  static async updateComponent(req, res, next) {
    try {
      const component = await FeeComponentService.update(req.params.id, req.body, req.user._id);
      return ApiResponse.success(res, component, 'Fee component updated');
    } catch (error) { next(error); }
  }

  static async toggleComponent(req, res, next) {
    try {
      const component = await FeeComponentService.toggleActive(req.params.id);
      return ApiResponse.success(res, component, 'Fee component toggled');
    } catch (error) { next(error); }
  }

  static async deleteComponent(req, res, next) {
    try {
      const component = await FeeComponentService.remove(req.params.id);
      return ApiResponse.success(res, component, 'Fee component deactivated');
    } catch (error) { next(error); }
  }

  // ═══════════════════════════════════════════════════════════
  //  STUDENT FEE PROFILES
  // ═══════════════════════════════════════════════════════════

  static async getClassMatrix(req, res, next) {
    try {
      const { classId } = req.params;
      const { academicYearId } = req.query;
      const data = await ProfileService.getClassMatrix(classId, academicYearId);
      return ApiResponse.success(res, data, 'Class fee matrix fetched');
    } catch (error) { next(error); }
  }

  static async bulkSaveProfiles(req, res, next) {
    try {
      const { classId, academicYearId, rows } = req.body;
      const result = await ProfileService.bulkSave({
        classId, academicYearId, rows, userId: req.user._id,
      });
      return ApiResponse.success(
        res, result,
        `Profiles saved: ${result.saved}, skipped (locked): ${result.skipped}`
      );
    } catch (error) { next(error); }
  }

  static async getStudentProfile(req, res, next) {
    try {
      const { studentId } = req.params;
      const { academicYearId } = req.query;
      const profile = await ProfileService.getStudentProfile(studentId, academicYearId);
      return ApiResponse.success(res, profile, 'Student fee profile fetched');
    } catch (error) { next(error); }
  }

  static async addDiscount(req, res, next) {
    try {
      const { studentId } = req.params;
      const { academicYearId } = req.query;
      const result = await ProfileService.addDiscount(
        studentId, academicYearId, req.body, req.user._id
      );
      // result = { profile, scheduleOutOfSync, netFee }
      const msg = result.scheduleOutOfSync
        ? `Discount added. ⚠ Schedule is now out of sync with net fee ₹${result.netFee}. Update the schedule before generating an invoice.`
        : 'Discount added successfully';
      return ApiResponse.success(res, result, msg);
    } catch (error) { next(error); }
  }

  static async lockProfile(req, res, next) {
    try {
      const { studentId } = req.params;
      const { academicYearId } = req.body;
      const profile = await ProfileService.lockProfile(studentId, academicYearId, req.user._id);
      return ApiResponse.success(res, profile, 'Profile locked');
    } catch (error) { next(error); }
  }

  static async unlockProfile(req, res, next) {
    try {
      const { studentId } = req.params;
      const { academicYearId } = req.body;
      const profile = await ProfileService.unlockProfile(studentId, academicYearId, req.user._id);
      return ApiResponse.success(res, profile, 'Profile unlocked');
    } catch (error) { next(error); }
  }

  // ═══════════════════════════════════════════════════════════
  //  INVOICE
  // ═══════════════════════════════════════════════════════════

  static async generateInvoice(req, res, next) {
    try {
      const { studentId } = req.body;
      const Student = require('../../models/Student');
      const student = await Student.findById(studentId);
      if (!student) {
        const AppError = require('../../utils/AppError');
        throw new AppError('Student not found', 404);
      }
      const invoice = await FeesService.generateInvoice({
        studentId:      student._id,
        classId:        student.classId,
        academicYearId: student.academicYearId,
      });
      return ApiResponse.created(res, invoice, 'Invoice generated');
    } catch (error) { next(error); }
  }

  static async getInvoice(req, res, next) {
    try {
      const { studentId } = req.params;
      const { academicYearId } = req.query;
      const invoice = await FeesService.getInvoice(studentId, academicYearId);
      return ApiResponse.success(res, invoice, 'Invoice fetched');
    } catch (error) { next(error); }
  }

  static async getInvoiceById(req, res, next) {
    try {
      const FeeInvoice        = require('../../models/FeeInvoice');
      const StudentFeeProfile = require('../../models/StudentFeeProfile');
      const AppError          = require('../../utils/AppError');

      const invoice = await FeeInvoice.findById(req.params.invoiceId)
        .populate('studentId', 'name rollNo admissionNumber parentName parentPhone classId sectionId')
        .populate('classId',   'name code')
        .populate('sectionId', 'name')
        .populate('academicYearId', 'name label')
        .populate('feeProfileId')
        .populate('lockedBy', 'name')
        .populate('waivedBy', 'name')
        .lean();

      if (!invoice) throw new AppError('Invoice not found', 404);

      // Enrich with profile's selectedComponents if not already populated
      if (!invoice.feeProfileId || !invoice.feeProfileId.selectedComponents) {
        const profile = await StudentFeeProfile.findOne({
          studentId: invoice.studentId?._id || invoice.studentId,
        })
          .populate('selectedComponents.componentId', 'name code amount mandatory recurringType')
          .lean();
        if (profile) invoice.feeProfileId = profile;
      }

      return ApiResponse.success(res, invoice, 'Invoice fetched');
    } catch (error) { next(error); }
  }

  static async recordInstallmentPayment(req, res, next) {
    try {
      const { invoiceId } = req.params;
      const { installmentId, amount, paymentMode, transactionId } = req.body;
      const result = await FeesService.recordInstallmentPayment({
        invoiceId, installmentId, amount, paymentMode, transactionId,
        userId: req.user._id,
      });
      return ApiResponse.created(res, result, 'Payment recorded successfully');
    } catch (error) { next(error); }
  }

  static async applyPenalty(req, res, next) {
    try {
      const { invoiceId } = req.params;
      const { type, value } = req.body;
      const invoice = await FeesService.applyPenalty(invoiceId, { type, value }, req.user._id);
      return ApiResponse.success(res, invoice, 'Penalty applied');
    } catch (error) { next(error); }
  }

  static async waivePenalty(req, res, next) {
    try {
      const { invoiceId } = req.params;
      const { waiveAmount, reason } = req.body;
      const invoice = await FeesService.waivePenalty(
        invoiceId, { waiveAmount, reason }, req.user._id
      );
      return ApiResponse.success(res, invoice, 'Penalty waived');
    } catch (error) { next(error); }
  }

  static async regenerateSchedule(req, res, next) {
    try {
      const invoice = await FeesService.regenerateSchedule(req.params.id, req.user._id);
      return ApiResponse.success(res, invoice, 'Invoice schedule regenerated');
    } catch (error) { next(error); }
  }

  static async lockInvoice(req, res, next) {
    try {
      const invoice = await FeesService.lockInvoice(req.params.invoiceId, req.user._id);
      return ApiResponse.success(res, invoice, 'Invoice locked');
    } catch (error) { next(error); }
  }

  static async unlockInvoice(req, res, next) {
    try {
      const invoice = await FeesService.unlockInvoice(req.params.invoiceId, req.user._id);
      return ApiResponse.success(res, invoice, 'Invoice unlocked');
    } catch (error) { next(error); }
  }

  // ─── Overview ─────────────────────────────────────────────
  static async getOverview(req, res, next) {
    try {
      const { classId } = req.query;
      const data = await FeesService.getFeeOverview({ classId });
      return ApiResponse.success(res, data, 'Fee overview fetched');
    } catch (error) { next(error); }
  }

  // ─── Analytics ────────────────────────────────────────────
  static async getDashboardStats(req, res, next) {
    try {
      const { classId, academicYearId } = req.query;
      const data = await AnalyticsService.getDashboardStats({ classId, academicYearId });
      return ApiResponse.success(res, data, 'Dashboard stats fetched');
    } catch (error) { next(error); }
  }

  static async getMonthlyCollection(req, res, next) {
    try {
      const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const data = await AnalyticsService.getMonthlyCollection(year);
      return ApiResponse.success(res, data, 'Monthly collection data fetched');
    } catch (error) { next(error); }
  }

  static async getClasswiseDues(req, res, next) {
    try {
      const { academicYearId } = req.query;
      const data = await AnalyticsService.getClasswiseDues(academicYearId);
      return ApiResponse.success(res, data, 'Classwise dues fetched');
    } catch (error) { next(error); }
  }

  static async getComponentSummary(req, res, next) {
    try {
      const { academicYearId } = req.query;
      const data = await AnalyticsService.getComponentSummary(academicYearId);
      return ApiResponse.success(res, data, 'Component summary fetched');
    } catch (error) { next(error); }
  }

  static async getOverdueStudents(req, res, next) {
    try {
      const { classId } = req.query;
      const data = await AnalyticsService.getOverdueStudents({ classId });
      return ApiResponse.success(res, data, 'Overdue students fetched');
    } catch (error) { next(error); }
  }

  // ─── PDF Generation ───────────────────────────────────────
  static async generateInvoicePDF(req, res, next) {
    try {
      const { invoiceId }   = req.params;
      const PdfService      = require('../../utils/pdfService');
      const PenaltyEngine   = require('../../utils/penaltyEngine');
      const FeeInvoice      = require('../../models/FeeInvoice');
      const StudentFeeProfile = require('../../models/StudentFeeProfile');
      const SchoolSetting   = require('../../models/SchoolSetting');
      const AppError        = require('../../utils/AppError');

      const invoice = await FeeInvoice.findById(invoiceId)
        .populate('studentId', 'name rollNo admissionNumber parentName parentPhone parentEmail classId sectionId')
        .populate('classId',   'name code')
        .populate('sectionId', 'name')
        .populate('academicYearId', 'name label')
        .populate('feeProfileId')
        .populate('lockedBy', 'name')
        .populate('waivedBy', 'name')
        .lean();

      if (!invoice) throw new AppError('Invoice not found', 404);

      // Ensure feeProfileId has selectedComponents
      if (!invoice.feeProfileId?.selectedComponents) {
        const profile = await StudentFeeProfile.findOne({
          studentId: invoice.studentId?._id || invoice.studentId,
        })
          .populate('selectedComponents.componentId', 'name code amount mandatory recurringType')
          .lean();
        invoice.feeProfileId = profile || invoice.feeProfileId;
      }

      const school = await SchoolSetting.findOne().lean() || {};
      const penaltySummary = PenaltyEngine.computeInvoicePenalty(invoice, null);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Invoice_${invoice.invoiceNumber || invoiceId}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');

      const doc = await PdfService.generateInvoicePDF(invoice, school, penaltySummary);
      doc.pipe(res);
      doc.end();
    } catch (error) { next(error); }
  }

  static async generateReceipt(req, res, next) {
    try {
      const paymentId     = req.params.id;
      const PdfService    = require('../../utils/pdfService');
      const FeePayment    = require('../../models/FeePayment');
      const FeeInvoice    = require('../../models/FeeInvoice');
      const SchoolSetting = require('../../models/SchoolSetting');
      const AppError      = require('../../utils/AppError');

      const payment = await FeePayment.findById(paymentId)
        .populate('studentId', 'name rollNo admissionNumber classId sectionId')
        .populate('collectedBy', 'name')
        .lean();
      if (!payment) throw new AppError('Payment not found', 404);

      const invoice = payment.invoiceId
        ? await FeeInvoice.findById(payment.invoiceId).populate('classId', 'name').lean()
        : null;
      const school = await SchoolSetting.findOne().lean() || {};

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Receipt_${payment.receiptNumber || paymentId}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');

      const doc = await PdfService.generateReceiptPDF(payment, invoice, school);
      doc.pipe(res);
      doc.end();
    } catch (error) { next(error); }
  }
}

module.exports = FeesController;
