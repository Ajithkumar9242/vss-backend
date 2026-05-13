const AssignmentService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class AssignmentController {
  static async create(req, res, next) {
    try {
      return ApiResponse.created(res, await AssignmentService.create(req.body, req.user), 'Assignment created');
    } catch (e) { next(e); }
  }

  static async getAll(req, res, next) {
    try {
      return ApiResponse.success(res, await AssignmentService.getAll(req.query, req.user), 'Assignments fetched');
    } catch (e) { next(e); }
  }

  static async getById(req, res, next) {
    try {
      return ApiResponse.success(res, await AssignmentService.getById(req.params.id));
    } catch (e) { next(e); }
  }

  static async update(req, res, next) {
    try {
      return ApiResponse.success(res, await AssignmentService.update(req.params.id, req.body, req.user), 'Assignment updated');
    } catch (e) { next(e); }
  }

  static async remove(req, res, next) {
    try {
      return ApiResponse.success(res, await AssignmentService.remove(req.params.id, req.user), 'Assignment deleted');
    } catch (e) { next(e); }
  }

  // ── Submissions ────────────────────────────────────────────

  static async submit(req, res, next) {
    try {
      const { studentId, fileUrl, fileName, mimeType, remarks } = req.body;
      const result = await AssignmentService.submit(req.params.id, studentId, { fileUrl, fileName, mimeType, remarks });
      return ApiResponse.created(res, result, 'Submission received');
    } catch (e) { next(e); }
  }

  static async getSubmissions(req, res, next) {
    try {
      return ApiResponse.success(res, await AssignmentService.getSubmissions(req.params.id, req.query));
    } catch (e) { next(e); }
  }

  static async grade(req, res, next) {
    try {
      const { studentId, marks, feedback } = req.body;
      const result = await AssignmentService.grade(req.params.id, studentId, { marks, feedback }, req.user);
      return ApiResponse.success(res, result, 'Submission graded');
    } catch (e) { next(e); }
  }
}

module.exports = AssignmentController;
