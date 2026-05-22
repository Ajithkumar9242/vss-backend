const router  = require('express').Router();
const C       = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, query, mongoIdParam } = require('../../utils/validators');

const admin  = authorize('admin', 'super_admin');
const staff  = authorize('admin', 'super_admin', 'faculty');
const reader = authorize('admin', 'super_admin', 'faculty', 'parent', 'student', 'visitor');
const submitters = authorize('admin', 'super_admin', 'faculty', 'parent', 'student');

router.use(protect);

// ── CRUD ──────────────────────────────────────────────────────
router.post(
  '/',
  staff,
  [
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('classId').isMongoId().withMessage('Valid classId required'),
    body('subjectId').isMongoId().withMessage('Valid subjectId required'),
    body('dueDate').isISO8601().withMessage('Valid dueDate required'),
    body('maxMarks').optional().isFloat({ min: 0 }),
  ],
  validate, C.create
);

router.get('/', reader, C.getAll);
router.get('/:id', reader, mongoIdParam('id'), validate, C.getById);

router.put(
  '/:id',
  staff, mongoIdParam('id'),
  [
    body('title').optional().trim(),
    body('dueDate').optional().isISO8601(),
    body('maxMarks').optional().isFloat({ min: 0 }),
  ],
  validate, C.update
);

router.delete('/:id', staff, mongoIdParam('id'), validate, C.remove);

// ── Submissions ───────────────────────────────────────────────
router.post(
  '/:id/submit',
  submitters,
  mongoIdParam('id'),
  [body('studentId').isMongoId().withMessage('Valid studentId required')],
  validate, C.submit
);

router.get('/:id/submissions', staff, mongoIdParam('id'), validate, C.getSubmissions);

router.put(
  '/:id/grade',
  staff, mongoIdParam('id'),
  [
    body('studentId').isMongoId().withMessage('Valid studentId required'),
    body('marks').isFloat({ min: 0 }).withMessage('marks required'),
  ],
  validate, C.grade
);

module.exports = router;
