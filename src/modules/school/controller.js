const SchoolService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * School Controller — handles HTTP request/response for school setup.
 * Delegates all business logic to SchoolService.
 */
class SchoolController {
  // ─── Classes ──────────────────────────────────────────────

  /**
   * POST /api/school/classes
   * Create a new class.
   */
  static async createClass(req, res, next) {
    try {
      const newClass = await SchoolService.createClass(req.body);
      return ApiResponse.created(res, { class: newClass }, 'Class created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/school/classes
   * Get all classes.
   */
  static async getClasses(req, res, next) {
    try {
      const result = await SchoolService.getClasses(req.query);
      return ApiResponse.paginated(res, result.classes, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      }, 'Classes retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // ─── Sections ─────────────────────────────────────────────

  /**
   * POST /api/school/sections
   * Create a new section.
   */
  static async createSection(req, res, next) {
    try {
      const section = await SchoolService.createSection(req.body);
      return ApiResponse.created(res, { section }, 'Section created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/school/sections
   * Get all sections (optionally filter by classId).
   */
  static async getSections(req, res, next) {
    try {
      const result = await SchoolService.getSections(req.query);
      return ApiResponse.paginated(res, result.sections, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      }, 'Sections retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // ─── Subjects ─────────────────────────────────────────────

  /**
   * POST /api/school/subjects
   * Create a new subject.
   */
  static async createSubject(req, res, next) {
    try {
      const subject = await SchoolService.createSubject(req.body);
      return ApiResponse.created(res, { subject }, 'Subject created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/school/subjects
   * Get all subjects.
   */
  static async getSubjects(req, res, next) {
    try {
      const result = await SchoolService.getSubjects(req.query);
      return ApiResponse.paginated(res, result.subjects, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      }, 'Subjects retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SchoolController;
