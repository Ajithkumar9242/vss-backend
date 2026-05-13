const AdmissionService = require('./service');
const ApiResponse      = require('../../utils/apiResponse');

/**
 * Admission Controller — HTTP layer only.
 * All business logic in AdmissionService.
 */
class AdmissionController {
  // ─── Public: available classes ─────────────────────────────
  static async getPublicClasses(req, res, next) {
    try {
      const Class = require('../../models/Class');
      const classes = await Class.find({ isActive: true }).select('name code').sort({ name: 1 }).lean();
      return ApiResponse.success(res, classes, 'Classes fetched');
    } catch (e) { next(e); }
  }

  // ─── Public: admission settings (open/closed) ──────────────
  static async getSettings(req, res, next) {
    try {
      const data = await AdmissionService.getAdmissionSettings();
      return ApiResponse.success(res, data, 'Admission settings fetched');
    } catch (e) { next(e); }
  }

  // ─── Admin: update settings ────────────────────────────────
  static async updateSettings(req, res, next) {
    try {
      const { admissionsOpen, activeAdmissionAcademicYearId } = req.body;
      const data = await AdmissionService.updateAdmissionSettings({
        admissionsOpen,
        activeAdmissionAcademicYearId,
      });
      return ApiResponse.success(res, data, 'Admission settings updated');
    } catch (e) { next(e); }
  }

  // ─── Public: submit online form ────────────────────────────
  static async submitPublic(req, res, next) {
    try {
      const admission = await AdmissionService.submitPublicAdmission(req.body);
      return ApiResponse.created(res, admission, 'Application submitted successfully');
    } catch (e) { next(e); }
  }

  // ─── Public: status by application number ──────────────────
  static async getByApplicationNo(req, res, next) {
    try {
      const admission = await AdmissionService.getAdmissionByApplicationNo(req.params.applicationNo);
      return ApiResponse.success(res, admission, 'Application status fetched');
    } catch (e) { next(e); }
  }

  // ─── Public: search by phone ───────────────────────────────
  static async searchByPhone(req, res, next) {
    try {
      const admissions = await AdmissionService.searchAdmissionsByPhone(req.query.phone);
      return ApiResponse.success(res, admissions, 'Search results');
    } catch (e) { next(e); }
  }

  // ─── Admin: list all ──────────────────────────────────────
  static async getAll(req, res, next) {
    try {
      const result = await AdmissionService.getAdmissions(req.query);
      return ApiResponse.success(res, result, 'Admissions fetched');
    } catch (e) { next(e); }
  }

  // ─── Admin: get by ID ─────────────────────────────────────
  static async getById(req, res, next) {
    try {
      const admission = await AdmissionService.getAdmissionById(req.params.id);
      return ApiResponse.success(res, admission, 'Admission fetched');
    } catch (e) { next(e); }
  }

  // ─── Admin: create (offline) ──────────────────────────────
  static async create(req, res, next) {
    try {
      const admission = await AdmissionService.createAdmission(req.body);
      return ApiResponse.created(res, admission, 'Admission application created');
    } catch (e) { next(e); }
  }

  // ─── Admin: update / edit ─────────────────────────────────
  static async update(req, res, next) {
    try {
      const admission = await AdmissionService.updateAdmission(
        req.params.id, req.body, req.user._id
      );
      return ApiResponse.success(res, admission, 'Admission updated');
    } catch (e) { next(e); }
  }

  // ─── Admin: approve ───────────────────────────────────────
  static async approve(req, res, next) {
    try {
      const { sectionId } = req.body;
      const result = await AdmissionService.approveAdmission(req.params.id, req.user._id, sectionId);
      return ApiResponse.success(res, result, 'Admission approved and student record created');
    } catch (e) { next(e); }
  }

  // ─── Admin: reject ────────────────────────────────────────
  static async reject(req, res, next) {
    try {
      const { remarks } = req.body;
      const admission = await AdmissionService.rejectAdmission(req.params.id, req.user._id, remarks);
      return ApiResponse.success(res, admission, 'Admission rejected');
    } catch (e) { next(e); }
  }

  // ─── Admin: hold ──────────────────────────────────────────
  static async hold(req, res, next) {
    try {
      const { remarks } = req.body;
      const admission = await AdmissionService.holdAdmission(req.params.id, req.user._id, remarks);
      return ApiResponse.success(res, admission, 'Admission placed on hold');
    } catch (e) { next(e); }
  }
}

module.exports = AdmissionController;
