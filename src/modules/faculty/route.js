const router = require('express').Router();
const FacultyController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam, query } = require('../../utils/validators');

router.use(protect);

router.post(
  '/',
  authorize('admin', 'super_admin'),
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

router.get('/', FacultyController.getAll);
router.get('/:id', mongoIdParam('id'), validate, FacultyController.getById);

/**
 * PATCH /api/faculty/:id
 * Partial update — avatar, designation, etc.
 */
router.patch(
  '/:id',
  authorize('admin', 'super_admin', 'faculty'),
  mongoIdParam('id'),
  validate,
  FacultyController.update
);

router.patch(
  '/:id/assign-classes',
  authorize('admin', 'super_admin'),
  [
    mongoIdParam('id'),
    body('classIds').isArray({ min: 0 }).withMessage('classIds must be an array'),
  ],
  validate,
  FacultyController.assignClasses
);

router.patch(
  '/:id/assign-subjects',
  authorize('admin', 'super_admin'),
  [
    mongoIdParam('id'),
    body('subjectIds').isArray({ min: 0 }).withMessage('subjectIds must be an array'),
  ],
  validate,
  FacultyController.assignSubjects
);

// ── Faculty Dashboard (self-service) ──────────────────────────
router.get('/me/dashboard',
  authorize('admin', 'super_admin', 'faculty'),
  FacultyController.getDashboard
);

router.get('/me/class/:classId/students',
  authorize('admin', 'super_admin', 'faculty'),
  mongoIdParam('classId'), validate,
  FacultyController.getClassStudents
);

router.get('/me/class/:classId/analytics/:examId',
  authorize('admin', 'super_admin', 'faculty'),
  mongoIdParam('classId'), mongoIdParam('examId'), validate,
  FacultyController.getClassAnalytics
);

router.get('/me/class/:classId/monthly-attendance',
  authorize('admin', 'super_admin', 'faculty'),
  mongoIdParam('classId'), validate,
  FacultyController.getMonthlyAttendance
);

module.exports = router;
