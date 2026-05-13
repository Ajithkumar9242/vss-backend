const StudentService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Student Controller — handles HTTP request/response.
 * Delegates all business logic to StudentService.
 */
class StudentController {
  /**
   * GET /api/students
   * Get all students with filters.
   */
  static async getAll(req, res, next) {
    try {
      const result = await StudentService.getStudents(req.query);
      return ApiResponse.paginated(res, result.students, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      }, 'Students retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/students/:id
   * Get a single student by ID.
   */
  static async getById(req, res, next) {
    try {
      const student = await StudentService.getStudentById(req.params.id);
      return ApiResponse.success(res, { student }, 'Student retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/students
   * Directly create a student (admin flow, no admission).
   */
  static async create(req, res, next) {
    try {
      const student = await StudentService.createStudent(req.body);
      return ApiResponse.created(res, { student }, 'Student created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/students/:id
   * Partial update (e.g. avatar URL after upload).
   */
  static async update(req, res, next) {
    try {
      const student = await StudentService.updateStudent(req.params.id, req.body);
      return ApiResponse.success(res, { student }, 'Student updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = StudentController;
