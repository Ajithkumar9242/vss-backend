const SubjectService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Subject Controller — HTTP request/response layer.
 * All business logic lives in SubjectService.
 */
class SubjectController {
  /**
   * POST /api/subjects
   * Create a new subject.
   */
  static async create(req, res, next) {
    try {
      const subject = await SubjectService.create(req.body);
      return ApiResponse.created(res, { subject }, 'Subject created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/subjects
   * List subjects with optional filters (classId, type, isActive, search, page, limit).
   */
  static async getAll(req, res, next) {
    try {
      const result = await SubjectService.getAll(req.query);
      return ApiResponse.paginated(
        res,
        result.subjects,
        { total: result.total, page: result.page, limit: result.limit },
        'Subjects fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/subjects/:id
   * Update a subject.
   */
  static async update(req, res, next) {
    try {
      const subject = await SubjectService.update(req.params.id, req.body);
      return ApiResponse.success(res, { subject }, 'Subject updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/subjects/:id
   * Soft-delete a subject (isActive = false).
   */
  static async softDelete(req, res, next) {
    try {
      const subject = await SubjectService.softDelete(req.params.id);
      return ApiResponse.success(res, { subject }, 'Subject deactivated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/subjects/:id/toggle
   * Toggle isActive for a subject.
   */
  static async toggle(req, res, next) {
    try {
      const subject = await SubjectService.toggleActive(req.params.id);
      return ApiResponse.success(
        res,
        { subject },
        `Subject ${subject.isActive ? 'activated' : 'deactivated'}`
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/subjects/:id/assign
   * @deprecated Use POST /api/setup/class-configs instead.
   *             ClassConfig is the source of truth for subject-class assignment.
   */
  static async assignToClassConfig(req, res, next) {
    try {
      return res.status(200).json({
        success: true,
        data: null,
        message:
          '[DEPRECATED] Subject-level class assignment is no longer supported. ' +
          'Use POST /api/setup/class-configs to manage subjects per class.',
        deprecated: true,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SubjectController;
