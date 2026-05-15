const SetupService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class SetupController {
  // ─── School Setting ─────────────────────────────────────
  static async getSchoolSetting(req, res, next) {
    try {
      const data = await SetupService.getSchoolSetting();
      return ApiResponse.success(res, data, 'School setting fetched');
    } catch (e) { next(e); }
  }

  static async upsertSchoolSetting(req, res, next) {
    try {
      const data = await SetupService.upsertSchoolSetting(req.body);
      return ApiResponse.success(res, data, 'School setting saved');
    } catch (e) { next(e); }
  }

  static async uploadLogo(req, res, next) {
    try {
      if (!req.file) { const AppError = require('../../utils/AppError'); throw new AppError('No file uploaded', 400); }
      const { uploadToCloudinary } = require('../../utils/fileUpload');
      const result = await uploadToCloudinary(req.file);
      const setting = await SetupService.upsertSchoolSetting({ logoUrl: result.url });
      return ApiResponse.success(res, { logoUrl: result.url, setting }, 'Logo uploaded');
    } catch (e) { next(e); }
  }

  static async getMessageTemplates(req, res, next) {
    try {
      const data = await SetupService.getMessageTemplates();
      return ApiResponse.success(res, data, 'Message templates fetched');
    } catch (e) { next(e); }
  }

  static async upsertMessageTemplates(req, res, next) {
    try {
      const data = await SetupService.upsertMessageTemplates(req.body);
      return ApiResponse.success(res, data.messageTemplates, 'Message templates saved');
    } catch (e) { next(e); }
  }


  // ─── Academic Year ───────────────────────────────────────
  static async createAcademicYear(req, res, next) {
    try {
      const data = await SetupService.createAcademicYear(req.body);
      return ApiResponse.created(res, data, 'Academic Year created');
    } catch (e) { next(e); }
  }

  static async getAcademicYears(req, res, next) {
    try {
      const data = await SetupService.getAcademicYears();
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async getActiveAcademicYear(req, res, next) {
    try {
      const data = await SetupService.getActiveAcademicYear();
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async updateAcademicYear(req, res, next) {
    try {
      const data = await SetupService.updateAcademicYear(req.params.id, req.body);
      return ApiResponse.success(res, data, 'Academic Year updated');
    } catch (e) { next(e); }
  }

  // ─── Academic Terms ──────────────────────────────────────
  static async createTerm(req, res, next) {
    try {
      const data = await SetupService.createTerm(req.body);
      return ApiResponse.created(res, data, 'Term created');
    } catch (e) { next(e); }
  }

  static async getTerms(req, res, next) {
    try {
      const data = await SetupService.getTerms(req.query.academicYearId);
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async updateTerm(req, res, next) {
    try {
      const data = await SetupService.updateTerm(req.params.id, req.body);
      return ApiResponse.success(res, data, 'Term updated');
    } catch (e) { next(e); }
  }

  static async deleteTerm(req, res, next) {
    try {
      const data = await SetupService.deleteTerm(req.params.id);
      return ApiResponse.success(res, data, 'Term deleted');
    } catch (e) { next(e); }
  }

  // ─── Class Config ────────────────────────────────────────
  static async upsertClassConfig(req, res, next) {
    try {
      const data = await SetupService.upsertClassConfig(req.body);
      return ApiResponse.success(res, data, 'Class Config saved');
    } catch (e) { next(e); }
  }

  static async getClassConfigs(req, res, next) {
    try {
      const data = await SetupService.getClassConfigs(req.query.academicYearId);
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  // ─── Class Groups ────────────────────────────────────────
  static async createClassGroup(req, res, next) {
    try {
      const data = await SetupService.createClassGroup(req.body);
      return ApiResponse.created(res, data, 'Class Group created');
    } catch (e) { next(e); }
  }

  static async getClassGroups(req, res, next) {
    try {
      const data = await SetupService.getClassGroups(req.query);
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async updateClassGroup(req, res, next) {
    try {
      const data = await SetupService.updateClassGroup(req.params.id, req.body);
      return ApiResponse.success(res, data, 'Class Group updated');
    } catch (e) { next(e); }
  }

  static async deleteClassGroup(req, res, next) {
    try {
      const data = await SetupService.deleteClassGroup(req.params.id);
      return ApiResponse.success(res, data, 'Class Group deleted');
    } catch (e) { next(e); }
  }


  // ─── Grade Config ────────────────────────────────────────
  static async createGradeConfig(req, res, next) {
    try {
      const data = await SetupService.createGradeConfig(req.body);
      return ApiResponse.created(res, data, 'Grade config created');
    } catch (e) { next(e); }
  }

  static async getGradeConfigs(req, res, next) {
    try {
      const data = await SetupService.getGradeConfigs();
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async updateGradeConfig(req, res, next) {
    try {
      const data = await SetupService.updateGradeConfig(req.params.id, req.body);
      return ApiResponse.success(res, data, 'Grade config updated');
    } catch (e) { next(e); }
  }

  static async deleteGradeConfig(req, res, next) {
    try {
      const data = await SetupService.deleteGradeConfig(req.params.id);
      return ApiResponse.success(res, data, 'Grade config deleted');
    } catch (e) { next(e); }
  }

  // ─── Attendance Config ───────────────────────────────────
  static async upsertAttendanceConfig(req, res, next) {
    try {
      const data = await SetupService.upsertAttendanceConfig(req.body);
      return ApiResponse.success(res, data, 'Attendance config saved');
    } catch (e) { next(e); }
  }

  static async getAttendanceConfig(req, res, next) {
    try {
      const data = await SetupService.getAttendanceConfig(req.query.academicYearId);
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  // ─── Payment Settings ────────────────────────────────────
  static async getPaymentSettings(req, res, next) {
    try {
      const data = await SetupService.getPaymentSettings();
      return ApiResponse.success(res, data);
    } catch (e) { next(e); }
  }

  static async upsertPaymentSettings(req, res, next) {
    try {
      const data = await SetupService.upsertPaymentSettings(req.body);
      return ApiResponse.success(res, data, 'Payment settings saved');
    } catch (e) { next(e); }
  }
}

module.exports = SetupController;
