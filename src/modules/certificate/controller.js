'use strict';

const CertificateService = require('./service');
const ApiResponse        = require('../../utils/apiResponse');

class CertificateController {
  // ── Template CRUD ────────────────────────────────────────────────────

  /** GET /api/certificates/templates */
  static async listTemplates(req, res, next) {
    try {
      const templates = await CertificateService.listTemplates();
      return ApiResponse.success(res, { templates }, 'Certificate templates fetched');
    } catch (err) { next(err); }
  }

  /** GET /api/certificates/templates/:id */
  static async getTemplate(req, res, next) {
    try {
      const tpl = await CertificateService.getTemplate(req.params.id);
      return ApiResponse.success(res, { template: tpl }, 'Certificate template fetched');
    } catch (err) { next(err); }
  }

  /** POST /api/certificates/templates */
  static async createTemplate(req, res, next) {
    try {
      const tpl = await CertificateService.createTemplate(
        req.body,
        req.user._id,
        req.user.role
      );
      return ApiResponse.success(res, { template: tpl }, 'Template created successfully', 201);
    } catch (err) { next(err); }
  }

  /** PATCH /api/certificates/templates/:id */
  static async updateTemplate(req, res, next) {
    try {
      const tpl = await CertificateService.updateTemplate(
        req.params.id,
        req.body,
        req.user.role
      );
      return ApiResponse.success(res, { template: tpl }, 'Template updated successfully');
    } catch (err) { next(err); }
  }

  /** DELETE /api/certificates/templates/:id */
  static async deleteTemplate(req, res, next) {
    try {
      const result = await CertificateService.deleteTemplate(req.params.id, req.user.role);
      return ApiResponse.success(res, result, result.message);
    } catch (err) { next(err); }
  }

  // ── Preview ──────────────────────────────────────────────────────────

  /** GET /api/certificates/preview?templateId=&studentId= */
  static async preview(req, res, next) {
    try {
      const { templateId, studentId } = req.query;
      if (!templateId || !studentId) {
        return res.status(400).json({ success: false, message: 'templateId and studentId are required' });
      }
      const data = await CertificateService.previewTemplate(templateId, studentId);
      return ApiResponse.success(res, data, 'Preview generated');
    } catch (err) { next(err); }
  }

  // ── PDF Download ─────────────────────────────────────────────────────

  /** GET /api/certificates/pdf?templateId=&studentId= */
  static async downloadPdf(req, res, next) {
    try {
      const { templateId, studentId } = req.query;
      if (!templateId || !studentId) {
        return res.status(400).json({ success: false, message: 'templateId and studentId are required' });
      }

      const doc = await CertificateService.generatePDF(templateId, studentId);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="certificate.pdf"');

      doc.pipe(res);
      doc.end();
    } catch (err) { next(err); }
  }
}

module.exports = CertificateController;
