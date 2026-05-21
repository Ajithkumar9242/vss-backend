const router = require('express').Router();
const FacultyController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam, query } = require('../../utils/validators');

router.use(protect);

// Role groups
const READONLY_ROLES = ['super_admin', 'admin', 'principal', 'accountant', 'faculty', 'visitor'];
const WRITE_ROLES = ['super_admin', 'admin', 'principal'];

/**
 * POST /api/faculty
 * Create faculty record — admin/principal only.
 */
router.post(
  '/',
  authorize(...WRITE_ROLES),
  [
    body('name').trim().notEmpty().withMessage('Faculty name is required'),
    body('email').optional().isEmail().withMessage('Valid email required'),
    body('phone').optional().trim(),
    body('designation').optional().trim(),
    body('department').optional().trim(),
    body('subjects').optional().isArray().withMessage('Subjects must be an array'),
  ],
  validate,
  FacultyController.create
);

/**
 * GET /api/faculty
 * View list — accountant + all staff can view.
 */
router.get('/', authorize(...READONLY_ROLES), FacultyController.getAll);
router.get('/:id', authorize(...READONLY_ROLES), mongoIdParam('id'), validate, FacultyController.getById);

/**
 * PATCH /api/faculty/:id
 * Update faculty — admin/principal; faculty may update their own record.
 */
router.patch(
  '/:id',
  authorize(...WRITE_ROLES, 'faculty'),   // faculty can self-edit
  mongoIdParam('id'),
  validate,
  FacultyController.update
);

/**
 * PATCH /api/faculty/:id/assign-classes
 * Assign classes — admin/principal only.
 */
router.patch(
  '/:id/assign-classes',
  authorize(...WRITE_ROLES),
  [
    mongoIdParam('id'),
    body('classIds').isArray({ min: 0 }).withMessage('classIds must be an array'),
  ],
  validate,
  FacultyController.assignClasses
);

/**
 * PATCH /api/faculty/:id/assign-subjects
 * Assign subjects — admin/principal only.
 */
router.patch(
  '/:id/assign-subjects',
  authorize(...WRITE_ROLES),
  [
    mongoIdParam('id'),
    body('subjectIds').isArray({ min: 0 }).withMessage('subjectIds must be an array'),
  ],
  validate,
  FacultyController.assignSubjects
);

// ── Faculty Dashboard (self-service) ──────────────────────────
router.get('/me/dashboard',
  authorize('admin', 'super_admin', 'principal', 'faculty'),
  FacultyController.getDashboard
);

router.get('/me/class/:classId/students',
  authorize('admin', 'super_admin', 'principal', 'faculty'),
  mongoIdParam('classId'), validate,
  FacultyController.getClassStudents
);

router.get('/me/class/:classId/analytics/:examId',
  authorize('admin', 'super_admin', 'principal', 'faculty'),
  mongoIdParam('classId'), mongoIdParam('examId'), validate,
  FacultyController.getClassAnalytics
);

router.get('/me/class/:classId/monthly-attendance',
  authorize('admin', 'super_admin', 'principal', 'faculty'),
  mongoIdParam('classId'), validate,
  FacultyController.getMonthlyAttendance
);

module.exports = router;
