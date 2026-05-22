const router = require('express').Router();
const AttendanceController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, query } = require('../../utils/validators');
const idempotency = require('../../middlewares/idempotency');

// ─── All attendance routes require authentication ───────────
router.use(protect);

// ─── Monthly Attendance routes (must be before /:param routes) ──
router.post('/monthly/upsert',
  authorize('admin', 'super_admin', 'faculty'),
  AttendanceController.upsertMonthly
);

router.get('/monthly/class/:classId',
  authorize('admin', 'super_admin', 'faculty', 'visitor'),
  AttendanceController.getMonthlyClassEntry
);

router.get('/monthly/report/class/:classId',
  authorize('admin', 'super_admin', 'faculty', 'visitor'),
  AttendanceController.getMonthlyClassReport
);

router.get('/monthly/report/student/:studentId',
  authorize('admin', 'super_admin', 'faculty', 'parent', 'visitor'),
  AttendanceController.getMonthlyStudentReport
);


router.get('/health', AttendanceController.health);

/**
 * @route   GET /api/attendance/sessions
 * @desc    Get configured sessions from AttendanceConfig
 * @access  Private
 */
router.get('/sessions', AttendanceController.getSessions);

/**
 * @route   POST /api/attendance
 * @desc    Mark attendance (bulk) for a class on a date+session
 * @access  Private
 */
router.post(
  '/',
  authorize('admin', 'super_admin', 'faculty'),
  idempotency(),
  [
    body('records')
      .isArray({ min: 1 })
      .withMessage('Records must be a non-empty array'),
    body('records.*.studentId')
      .isMongoId()
      .withMessage('Valid student ID is required'),
    body('records.*.classId')
      .isMongoId()
      .withMessage('Valid class ID is required'),
    body('records.*.date')
      .isISO8601()
      .withMessage('Valid date is required'),
    body('records.*.status')
      .isIn(['present', 'absent', 'late', 'excused'])
      .withMessage('Status must be present, absent, late, or excused'),
    body('records.*.session')
      .optional()
      .isString()
      .withMessage('Session must be a string'),
  ],
  validate,
  AttendanceController.markAttendance
);

/**
 * @route   POST /api/attendance/lock
 * @desc    Lock attendance for class + date + session (admin only)
 * @access  Private (admin, super_admin)
 */
router.post(
  '/lock',
  authorize('admin', 'super_admin', 'faculty'),
  [
    body('classId').isMongoId().withMessage('Valid class ID is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('session').optional().isString(),
  ],
  validate,
  AttendanceController.lockAttendance
);

/**
 * @route   GET /api/attendance
 * @desc    Get attendance records (?classId=xxx&date=xxx&sectionId=xxx&session=xxx)
 * @access  Private
 */
router.get(
  '/',
  [
    query('date').optional().isISO8601().withMessage('Valid date is required'),
    query('session').optional().isString(),
  ],
  validate,
  AttendanceController.getAttendance
);

/**
 * @route   GET /api/attendance/report
 * @desc    Aggregated attendance report
 * @access  Private
 */
router.get(
  '/report',
  authorize('admin', 'super_admin', 'faculty', 'parent', 'visitor'),
  [
    query('classId').isMongoId().withMessage('Valid class ID is required'),
    query('dateFrom').optional().isISO8601().withMessage('Valid dateFrom required'),
    query('dateTo').optional().isISO8601().withMessage('Valid dateTo required'),
    query('session').optional().isString(),
  ],
  validate,
  AttendanceController.getReport
);

/**
 * @route   GET /api/attendance/student/:studentId
 * @desc    Get attendance records for a specific student
 * @access  Private (admin, faculty, parent)
 */
router.get(
  '/student/:studentId',
  authorize('admin', 'super_admin', 'faculty', 'parent', 'visitor'),
  [
    require('express-validator').param('studentId').isMongoId().withMessage('Valid studentId required'),
    require('../../utils/validators').validate,
  ],
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const { dateFrom, dateTo, session } = req.query;
      const Attendance = require('../../models/Attendance');
      const query = { studentId };
      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) query.date.$gte = new Date(dateFrom);
        if (dateTo) query.date.$lte = new Date(dateTo);
      }
      if (session) query.session = session;
      const records = await Attendance.find(query).sort({ date: -1 }).limit(200).lean();
      const total = records.length;
      const present = records.filter(r => r.status === 'present').length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
      const ApiResponse = require('../../utils/apiResponse');
      return ApiResponse.success(res, { records, stats: { total, present, percentage } }, 'Student attendance fetched');
    } catch (e) { next(e); }
  }
);

module.exports = router;
