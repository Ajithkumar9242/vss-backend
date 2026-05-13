const AttendanceService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Attendance Controller — handles HTTP request/response.
 * Delegates all business logic to AttendanceService.
 */
class AttendanceController {
  /**
   * GET /api/attendance/health
   */
  static async health(req, res, next) {
    try {
      const data = await AttendanceService.getModuleStatus();
      return ApiResponse.success(res, data, 'Attendance module operational');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/attendance/sessions
   * Get configured sessions from AttendanceConfig.
   */
  static async getSessions(req, res, next) {
    try {
      const sessions = await AttendanceService.getSessions();
      return ApiResponse.success(res, sessions, 'Sessions fetched');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/attendance
   * Mark attendance in bulk.
   * Body: { records: [{ studentId, classId, sectionId?, date, status, session? }] }
   */
  static async markAttendance(req, res, next) {
    try {
      const { records } = req.body;
      const markedBy = req.user?._id || null;
      const userRole = req.user?.role || 'faculty';
      const result = await AttendanceService.markAttendance(records, markedBy, userRole);
      return ApiResponse.created(res, result, 'Attendance saved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/attendance/lock
   * Lock attendance for a class + date + session (admin only).
   * Body: { classId, date, session? }
   */
  static async lockAttendance(req, res, next) {
    try {
      const { classId, date, session } = req.body;
      const result = await AttendanceService.lockAttendance({ classId, date, session });
      return ApiResponse.success(res, result, 'Attendance locked successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/attendance
   * Get attendance records for a date.
   * Query: ?classId=xxx&date=yyyy-mm-dd&sectionId=xxx&session=Morning
   */
  static async getAttendance(req, res, next) {
    try {
      const { classId, sectionId, date, session } = req.query;
      const records = await AttendanceService.getAttendanceByDate({ classId, sectionId, date, session });
      return ApiResponse.success(res, records, 'Attendance records fetched');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/attendance/report
   * Aggregated report.
   * Query: ?classId=xxx&dateFrom=xxx&dateTo=xxx&session=xxx
   */
  static async getReport(req, res, next) {
    try {
      const { classId, dateFrom, dateTo, session } = req.query;
      const data = await AttendanceService.getAttendanceReport({ classId, dateFrom, dateTo, session });
      return ApiResponse.success(res, data, 'Attendance report generated');
    } catch (error) {
      next(error);
    }
  }

  // ─── Monthly Attendance ──────────────────────────────────

  static async upsertMonthly(req, res, next) {
    try {
      const { classId, monthKey, totalClassesConducted, rows, academicYearId } = req.body;
      const result = await AttendanceService.upsertMonthlyAttendance({
        classId, monthKey, totalClassesConducted, rows,
        academicYearId: academicYearId || null,
        userId: req.user?._id,
      });
      return ApiResponse.created(res, result, 'Monthly attendance saved');
    } catch (error) { next(error); }
  }

  static async getMonthlyClassEntry(req, res, next) {
    try {
      const { classId } = req.params;
      const { monthKey, academicYearId } = req.query;
      const data = await AttendanceService.getMonthlyClassEntry(classId, monthKey, academicYearId || null);
      return ApiResponse.success(res, data, 'Monthly entry fetched');
    } catch (error) { next(error); }
  }

  static async getMonthlyClassReport(req, res, next) {
    try {
      const { academicYearId } = req.query;
      const data = await AttendanceService.getMonthlyClassReport(req.params.classId, academicYearId || null);
      return ApiResponse.success(res, data, 'Monthly class report generated');
    } catch (error) { next(error); }
  }

  static async getMonthlyStudentReport(req, res, next) {
    try {
      const data = await AttendanceService.getMonthlyStudentReport(req.params.studentId);
      return ApiResponse.success(res, data, 'Monthly student report generated');
    } catch (error) { next(error); }
  }
}

module.exports = AttendanceController;

