'use strict';

const VaultService = require('./service');
const ApiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { resolveStudentForParent, ADMIN_ROLES } = require('../../utils/vaultGuard');
const SchoolSetting = require('../../models/SchoolSetting');
const { generateRequestReceiptPdf } = require('../../utils/pdf/requestReceiptPdf');
const StudentDocumentRequest = require('../../models/StudentDocumentRequest');

class VaultController {

  // ── Catalog ──────────────────────────────────────────────

  static async listCatalog(req, res, next) {
    try {
      const onlyActive = req.user.role === 'parent';
      const items = await VaultService.listCatalog(onlyActive);
      return ApiResponse.success(res, items, 'Catalog fetched');
    } catch (e) { next(e); }
  }

  static async createCatalogItem(req, res, next) {
    try {
      const item = await VaultService.createCatalogItem(req.body, req.user._id);
      return ApiResponse.created(res, item, 'Catalog item created');
    } catch (e) { next(e); }
  }

  static async updateCatalogItem(req, res, next) {
    try {
      const item = await VaultService.updateCatalogItem(req.params.id, req.body);
      return ApiResponse.success(res, item, 'Catalog item updated');
    } catch (e) { next(e); }
  }

  static async toggleCatalogItem(req, res, next) {
    try {
      const item = await VaultService.toggleCatalogItem(req.params.id);
      return ApiResponse.success(res, item, `Item ${item.active ? 'activated' : 'deactivated'}`);
    } catch (e) { next(e); }
  }

  // ── Requests — Admin ─────────────────────────────────────

  static async listRequests(req, res, next) {
    try {
      const filters = {
        studentId: req.query.studentId,
        paymentStatus: req.query.paymentStatus,
        requestStatus: req.query.requestStatus,
      };
      const requests = await VaultService.listRequests(filters);
      return ApiResponse.success(res, requests, 'Requests fetched');
    } catch (e) { next(e); }
  }

  static async approveRequest(req, res, next) {
    try {
      const result = await VaultService.approveRequest({ requestId: req.params.id, adminNotes: req.body.adminNotes, adminUserId: req.user._id });
      return ApiResponse.success(res, result, 'Request approved');
    } catch (e) { next(e); }
  }

  static async rejectRequest(req, res, next) {
    try {
      const result = await VaultService.rejectRequest({ requestId: req.params.id, adminNotes: req.body.adminNotes, adminUserId: req.user._id });
      return ApiResponse.success(res, result, 'Request rejected');
    } catch (e) { next(e); }
  }

  static async fulfillRequest(req, res, next) {
    try {
      const result = await VaultService.fulfillRequest({ requestId: req.params.id, vaultFileId: req.body.vaultFileId, adminUserId: req.user._id });
      return ApiResponse.success(res, result, 'Request fulfilled');
    } catch (e) { next(e); }
  }

  static async adminMarkPaid(req, res, next) {
    try {
      const { overrideReason } = req.body;
      const result = await VaultService.adminMarkPaid({ requestId: req.params.id, overrideReason, adminUserId: req.user._id });
      return ApiResponse.success(res, result, 'Payment marked as paid (admin override)');
    } catch (e) { next(e); }
  }

  // ── Files — Admin ────────────────────────────────────────

  static async uploadFile(req, res, next) {
    try {
      const { studentId } = req.params;
      const { title, description, catalogItemId, requestId, visibleToParent, requiresApprovedRequest, tags, issueDate } = req.body;
      if (!req.file) throw new AppError('File is required', 400);
      const vaultFile = await VaultService.uploadFile({ file: req.file, studentId, title, description, catalogItemId, requestId, visibleToParent, requiresApprovedRequest, tags, issueDate, adminUserId: req.user._id });
      return ApiResponse.created(res, { _id: vaultFile._id, title: vaultFile.title, mimeType: vaultFile.mimeType, fileSize: vaultFile.fileSize, visibleToParent: vaultFile.visibleToParent }, 'File uploaded');
    } catch (e) { next(e); }
  }

  static async listStudentFiles(req, res, next) {
    try {
      const files = await VaultService.listStudentFiles(req.params.studentId);
      return ApiResponse.success(res, files, 'Files fetched');
    } catch (e) { next(e); }
  }

  static async softDeleteFile(req, res, next) {
    try {
      const result = await VaultService.softDeleteFile(req.params.fileId, req.user._id);
      return ApiResponse.success(res, result, 'File deleted');
    } catch (e) { next(e); }
  }

  // ── Files — Parent ───────────────────────────────────────

  static async listMyFiles(req, res, next) {
    try {
      const studentId = req.query.studentId;
      await resolveStudentForParent(req, studentId);
      const files = await VaultService.listMyFiles(studentId);
      return ApiResponse.success(res, files, 'Your files fetched');
    } catch (e) { next(e); }
  }

  // ── Download ─────────────────────────────────────────────
  // Validates access, then lets the browser navigate directly to Cloudinary.


  static async downloadFile(req, res, next) {
    try {
      const file = await VaultService.getDownloadableFile(
        req.user,
        req.params.fileId
      );

      if (!file?.fileUrl) {
        return ApiResponse.error(res, 'File URL missing', 404);
      }

      return res.redirect(file.fileUrl);

    } catch (error) {
      next(error);
    }
  }



  // ── Requests — Parent ─────────────────────────────────────

  static async createRequest(req, res, next) {
    try {
      const { studentId, catalogItemId, copies, parentNotes, academicYearId } = req.body;
      await resolveStudentForParent(req, studentId);
      const request = await VaultService.createRequest({ studentId, catalogItemId, copies, parentNotes, parentUserId: req.user._id, academicYearId });
      return ApiResponse.created(res, request, 'Request created');
    } catch (e) { next(e); }
  }

  static async listMyRequests(req, res, next) {
    try {
      const studentId = req.query.studentId;
      await resolveStudentForParent(req, studentId);
      const requests = await VaultService.listMyRequests(studentId);
      return ApiResponse.success(res, requests, 'Your requests fetched');
    } catch (e) { next(e); }
  }

  static async createRazorpayOrder(req, res, next) {
    try {
      const request = await StudentDocumentRequest.findById(req.params.id).lean();
      if (!request) throw new AppError('Request not found', 404);
      if (request.parentUserId.toString() !== req.user._id.toString()) throw new AppError('Access denied', 403);
      const order = await VaultService.createRazorpayOrder(req.params.id, req.user._id);
      return ApiResponse.success(res, order, 'Payment order created');
    } catch (e) { next(e); }
  }

  static async confirmPayment(req, res, next) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const result = await VaultService.confirmRazorpayPayment({ requestId: req.params.id, razorpay_order_id, razorpay_payment_id, razorpay_signature, parentUserId: req.user._id });
      return ApiResponse.success(res, result, 'Payment confirmed');
    } catch (e) { next(e); }
  }

  static async getRequestReceipt(req, res, next) {
    try {
      const request = await StudentDocumentRequest.findById(req.params.id)
        .populate('catalogItemId', 'name code')
        .populate('studentId', 'name rollNo')
        .lean();
      if (!request) throw new AppError('Request not found', 404);
      if (req.user.role === 'parent') {
        await resolveStudentForParent(req, request.studentId?._id || request.studentId);
      }
      const school = await SchoolSetting.findOne().lean();
      const buffer = await generateRequestReceiptPdf(request, school);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${request.requestNumber || req.params.id}.pdf"`);
      res.send(buffer);
    } catch (e) { next(e); }
  }
}

module.exports = VaultController;
