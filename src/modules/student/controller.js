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
   * GET /api/students/:id/profile
   * Get an aggregate student profile including admission, attendance, and fees.
   */
  static async getProfile(req, res, next) {
    try {
      const profile = await StudentService.getStudentProfile(req.params.id);
      return ApiResponse.success(res, profile, 'Student profile retrieved successfully');
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

  /**
   * POST /api/students/bulk-import
   * Bulk import students from parsed CSV rows.
   * Accepts: { rows: Array<Object> }
   */
  static async bulkImport(req, res, next) {
    try {
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return ApiResponse.error(res, 'rows must be a non-empty array', 400);
      }
      if (rows.length > 1000) {
        return ApiResponse.error(res, 'Maximum 1000 rows per import batch', 400);
      }
      const result = await StudentService.bulkImport(rows);
      return ApiResponse.success(res, result, `Import complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/students/sample-csv
   * Download a sample CSV template for bulk student import.
   */
  static getSampleCsv(req, res) {
    const headers = [
      'studentName', 'class', 'section', 'dateOfBirth', 'gender',
      'admissionNo', 'registerNo', 'rollNo',
      'parentName', 'parentPhone', 'parentEmail',
      'bloodGroup', 'address',
      'aadhaarNo', 'satsNumber', 'apaarNumber',
    ];
    const exampleRow = [
      'Ravi Kumar', 'Class 5', 'A', '2014-06-15', 'male',
      'ADM-001', 'REG-001', '',
      'Suresh Kumar', '9876543210', 'suresh@example.com',
      'O+', '12 Main Street, Bangalore',
      '', '', '',
    ];
    const csvContent = [headers.join(','), exampleRow.join(',')].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.csv"');
    res.send(csvContent);
  }
}

module.exports = StudentController;
