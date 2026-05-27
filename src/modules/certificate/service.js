'use strict';

const CertificateTemplate = require('../../models/CertificateTemplate');
const Student             = require('../../models/Student');
const SchoolSetting       = require('../../models/SchoolSetting');
const AcademicYear        = require('../../models/AcademicYear');
const AppError            = require('../../utils/AppError');
const { generateCertificatePDF, buildVariables, resolveVars } = require('../../utils/pdf/certificatePdf');

const CERT_ROLES = ['super_admin', 'admin', 'principal'];

class CertificateService {
  // ── Authorize write operations ────────────────────────────────────────
  static _requireWriteRole(role) {
    if (!CERT_ROLES.includes(role)) {
      throw new AppError('You do not have permission to manage certificate templates', 403);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  TEMPLATE CRUD
  // ════════════════════════════════════════════════════════════════════

  /**
   * List all active certificate templates.
   */
  static async listTemplates() {
    return CertificateTemplate.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role')
      .lean();
  }

  /**
   * Get a single template by id.
   */
  static async getTemplate(id) {
    const tpl = await CertificateTemplate.findById(id)
      .populate('createdBy', 'name email role')
      .lean();
    if (!tpl) throw new AppError('Certificate template not found', 404);
    return tpl;
  }

  /**
   * Create a new certificate template.
   */
  static async createTemplate(data, userId, userRole) {
    CertificateService._requireWriteRole(userRole);
    const tpl = await CertificateTemplate.create({ ...data, createdBy: userId });
    return tpl.toObject();
  }

  /**
   * Update an existing certificate template.
   */
  static async updateTemplate(id, data, userRole) {
    CertificateService._requireWriteRole(userRole);
    const tpl = await CertificateTemplate.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!tpl) throw new AppError('Certificate template not found', 404);
    return tpl.toObject();
  }

  /**
   * Soft-delete (deactivate) a template.
   */
  static async deleteTemplate(id, userRole) {
    CertificateService._requireWriteRole(userRole);
    const tpl = await CertificateTemplate.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    );
    if (!tpl) throw new AppError('Certificate template not found', 404);
    return { message: 'Template deleted successfully' };
  }

  // ════════════════════════════════════════════════════════════════════
  //  VARIABLE PREVIEW
  // ════════════════════════════════════════════════════════════════════

  /**
   * Return template with variables resolved using real student data
   * (used for preview before PDF download).
   */
  static async previewTemplate(templateId, studentId) {
    const [tpl, student, school, activeYear] = await Promise.all([
      CertificateTemplate.findById(templateId).lean(),
      Student.findById(studentId)
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .lean(),
      SchoolSetting.findOne().lean(),
      AcademicYear.findOne({ isActive: true }).lean(),
    ]);

    if (!tpl)     throw new AppError('Certificate template not found', 404);
    if (!student) throw new AppError('Student not found', 404);

    // Merge principal overrides
    const vars = buildVariables(student, school, activeYear);
    if (tpl.principalName)        vars.principalName        = tpl.principalName;
    if (tpl.principalDesignation) vars.principalDesignation = tpl.principalDesignation;

    const resolved = {
      ...tpl,
      title:      resolveVars(tpl.title || tpl.name, vars),
      headerText: resolveVars(tpl.headerText || '', vars),
      content:    resolveVars(tpl.content, vars),
      footerText: resolveVars(tpl.footerText || '', vars),
    };

    return { template: resolved, student, variables: vars };
  }

  // ════════════════════════════════════════════════════════════════════
  //  PDF GENERATION
  // ════════════════════════════════════════════════════════════════════

  /**
   * Generate a certificate PDF for a student.
   * Returns a PDFDocument stream.
   */
  static async generatePDF(templateId, studentId) {
    const [tpl, student, school, activeYear] = await Promise.all([
      CertificateTemplate.findById(templateId).lean(),
      Student.findById(studentId)
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .lean(),
      SchoolSetting.findOne().lean(),
      AcademicYear.findOne({ isActive: true }).lean(),
    ]);

    if (!tpl)     throw new AppError('Certificate template not found', 404);
    if (!student) throw new AppError('Student not found', 404);

    const doc = await generateCertificatePDF(tpl, student, school, activeYear);
    return doc;
  }
}

module.exports = CertificateService;
