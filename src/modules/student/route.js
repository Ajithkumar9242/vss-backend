const router = require('express').Router();
const StudentController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, validate, query, mongoIdParam, paginationQuery } = require('../../utils/validators');

// ─── All student routes require authentication ──────────────
router.use(protect);

/**
 * @route   GET /api/students
 * @desc    Get all students (filter by ?classId=xxx&sectionId=xxx&search=xxx)
 * @access  Private
 */
router.get(
  '/',
  [
    ...paginationQuery,
    query('classId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Invalid classId format'),
    query('sectionId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Invalid sectionId format'),
  ],
  validate,
  StudentController.getAll
);

/**
 * @route   GET /api/students/:id
 * @desc    Get single student by ID
 * @access  Private
 */
router.get('/:id', mongoIdParam('id'), validate, StudentController.getById);

/**
 * @route   POST /api/students
 * @desc    Directly create a student (admin flow — no admission needed)
 * @access  Private (admin, super_admin)
 */
const createStudentValidation = [
  body('name').trim().notEmpty().withMessage('Student name is required'),
  body('dateOfBirth').notEmpty().isISO8601().withMessage('Valid date of birth is required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  body('classId').notEmpty().isMongoId().withMessage('Valid class ID is required'),
  body('sectionId').optional({ values: 'null' }).isMongoId().withMessage('Invalid section ID'),
  body('parentName').trim().notEmpty().withMessage('Parent name is required'),
  body('parentPhone').trim().notEmpty().withMessage('Parent phone is required'),
  body('parentEmail').optional().isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('bloodGroup').optional().trim(),
  validate,
];
router.post('/', authorize('admin', 'super_admin'), createStudentValidation, StudentController.create);

/**
 * @route   PATCH /api/students/:id
 * @desc    Partial update (avatar, address, etc.)
 * @access  Private (admin, super_admin)
 */
router.patch(
  '/:id',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'),
  validate,
  StudentController.update
);

module.exports = router;
