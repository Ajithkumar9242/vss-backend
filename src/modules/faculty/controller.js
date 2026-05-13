const FacultyService = require('./service');
const DashboardService = require('./dashboardService');
const ApiResponse = require('../../utils/apiResponse');

class FacultyController {
  static async create(req, res, next) {
    try {
      const faculty = await FacultyService.create(req.body);
      return ApiResponse.created(res, faculty, 'Faculty created successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req, res, next) {
    try {
      const { page, limit, search, isActive } = req.query;
      const data = await FacultyService.getAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        search,
        isActive,
      });
      return ApiResponse.success(res, data, 'Faculty list fetched');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const faculty = await FacultyService.getById(req.params.id);
      return ApiResponse.success(res, faculty, 'Faculty details fetched');
    } catch (error) {
      next(error);
    }
  }

  static async assignClasses(req, res, next) {
    try {
      const { classIds } = req.body;
      const faculty = await FacultyService.assignClasses(req.params.id, classIds);
      return ApiResponse.success(res, faculty, 'Classes assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/faculty/:id
   * General partial update (e.g. avatar).
   */
  static async update(req, res, next) {
    try {
      const faculty = await FacultyService.update(req.params.id, req.body);
      return ApiResponse.success(res, faculty, 'Faculty updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async assignSubjects(req, res, next) {
    try {
      const { subjectIds } = req.body;
      const faculty = await FacultyService.assignSubjects(req.params.id, subjectIds);
      return ApiResponse.success(res, faculty, 'Subjects assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  // ── Dashboard endpoints ─────────────────────────────────────────

  static async getDashboard(req, res, next) {
    try {
      return ApiResponse.success(res, await DashboardService.getDashboard(req.user._id));
    } catch (e) { next(e); }
  }

  static async getClassStudents(req, res, next) {
    try {
      return ApiResponse.success(res, await DashboardService.getClassStudents(req.params.classId, req.user._id));
    } catch (e) { next(e); }
  }

  static async getClassAnalytics(req, res, next) {
    try {
      const { classId, examId } = req.params;
      return ApiResponse.success(res, await DashboardService.getClassAnalytics(classId, examId));
    } catch (e) { next(e); }
  }

  static async getMonthlyAttendance(req, res, next) {
    try {
      const { classId } = req.params;
      const year  = parseInt(req.query.year)  || new Date().getFullYear();
      const month = parseInt(req.query.month) || new Date().getMonth() + 1;
      return ApiResponse.success(res, await DashboardService.getMonthlyAttendance(classId, year, month));
    } catch (e) { next(e); }
  }
}

module.exports = FacultyController;
