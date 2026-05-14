const router = require('express').Router();
const C = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, query, mongoIdParam } = require('../../utils/validators');
const idempotency = require('../../middlewares/idempotency');

const admin  = authorize('admin', 'super_admin');
const adminPrincipal = authorize('admin', 'super_admin', 'principal');
const staff  = authorize('admin', 'super_admin', 'faculty');
const reader = authorize('admin', 'super_admin', 'faculty', 'parent');

router.use(protect);

// ── Utility / Lookup ──────────────────────────────────────
router.get('/health', C.health);
router.get(
  '/subjects-for-class',
  [query('classId').isMongoId().withMessage('Valid classId required')],
  validate,
  C.getSubjectsForClass
);

// ── Student results — must be BEFORE /:id ─────────────────
router.get('/results/:studentId', reader, mongoIdParam('studentId'), validate, C.getStudentResults);

// ── EXAM CRUD ─────────────────────────────────────────────
router.post(
  '/',
  admin, idempotency(),
  [
    body('examName').optional().trim(),
    body('name').optional().trim(),
    body('classId').isMongoId().withMessage('classId required'),
    body('academicYearId').optional({ values: 'null' }).isMongoId(),
    body('maxMarks').isFloat({ min: 1 }).withMessage('maxMarks >= 1'),
    body('passingMarks').optional().isFloat({ min: 0 }),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('examDate').optional({ nullable: true }).isISO8601(),
    body('subjects').optional().isArray(),
    body('subjects.*').optional().isMongoId(),
  ],
  validate, C.createExam
);

router.get(
  '/',
  [
    query('classId').optional({ values: 'falsy' }).isMongoId(),
    query('academicYearId').optional({ values: 'falsy' }).isMongoId(),
    query('status').optional(),
  ],
  validate, C.getExams
);

router.get('/:id', reader, mongoIdParam('id'), validate, C.getExamById);

router.put(
  '/:id',
  admin,
  [
    mongoIdParam('id'),
    body('examName').optional().trim(),
    body('name').optional().trim(),
    body('maxMarks').optional().isFloat({ min: 1 }),
    body('passingMarks').optional().isFloat({ min: 0 }),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('subjects').optional().isArray(),
  ],
  validate, C.updateExam
);

router.delete('/:id', admin, mongoIdParam('id'), validate, C.deleteExam);

// ── Lifecycle ─────────────────────────────────────────────
router.patch('/:id/publish', admin, mongoIdParam('id'), validate, C.publishExam);
router.patch('/:id/lock',    admin, mongoIdParam('id'), validate, C.lockExam);

// ── Marks ─────────────────────────────────────────────────
router.post(
  '/:examId/marks',
  staff, idempotency({ windowMs: 3000 }),
  [
    mongoIdParam('examId'),
    body('marks').isArray({ min: 1 }).withMessage('marks[] required'),
    body('marks.*.studentId').isMongoId(),
    body('marks.*.subjectId').isMongoId(),
    body('marks.*.marksObtained').isFloat({ min: 0 }),
  ],
  validate, C.saveMarks
);

router.get('/:examId/marks', mongoIdParam('examId'), validate, C.getExamMarks);

// ── Results per exam ──────────────────────────────────────
router.get('/:examId/results', reader, mongoIdParam('examId'), validate, C.getExamResults);

// ── PDF Download ──────────────────────────────────────────
router.get('/:examId/results/pdf', adminPrincipal, mongoIdParam('examId'), validate, C.getResultsPdf);

module.exports = router;
