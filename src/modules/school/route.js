const router = require('express').Router();
const SchoolController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, validate, mongoIdParam, paginationQuery } = require('../../utils/validators');

// ─── All school routes require authentication ───────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════
//  CLASSES
// ═══════════════════════════════════════════════════════════

const createClassValidation = [
  body('name').trim().notEmpty().withMessage('Class name is required'),
  body('code').trim().notEmpty().withMessage('Class code is required'),
  body('description').optional().trim(),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
  validate,
];

/**
 * @route   POST /api/school/classes
 * @desc    Create a new class
 * @access  Private (admin, super_admin)
 */
router.post('/classes', authorize('admin', 'super_admin'), createClassValidation, SchoolController.createClass);

/**
 * @route   GET /api/school/classes
 * @desc    Get all classes
 * @access  Private
 */
router.get('/classes', ...paginationQuery, validate, SchoolController.getClasses);

// ═══════════════════════════════════════════════════════════
//  SECTIONS
// ═══════════════════════════════════════════════════════════

const createSectionValidation = [
  body('name').trim().notEmpty().withMessage('Section name is required'),
  body('classId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid Class ID format'),
  body('capacity').optional().isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  validate,
];

/**
 * @route   POST /api/school/sections
 * @desc    Create a new section
 * @access  Private (admin, super_admin)
 */
router.post('/sections', authorize('admin', 'super_admin'), createSectionValidation, SchoolController.createSection);

/**
 * @route   GET /api/school/sections
 * @desc    Get all sections (filter by ?classId=xxx)
 * @access  Private
 */
router.get(
  '/sections',
  [
    ...paginationQuery,
    require('../../utils/validators').query('classId')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Invalid classId format'),
  ],
  validate,
  SchoolController.getSections
);

// ═══════════════════════════════════════════════════════════
//  SUBJECTS
// ═══════════════════════════════════════════════════════════

const createSubjectValidation = [
  body('name').trim().notEmpty().withMessage('Subject name is required'),
  body('code').trim().notEmpty().withMessage('Subject code is required'),
  body('type').optional().isIn(['theory', 'practical', 'elective']).withMessage('Type must be theory, practical, or elective'),
  validate,
];

/**
 * @route   POST /api/school/subjects
 * @desc    Create a new subject
 * @access  Private (admin, super_admin)
 */
router.post('/subjects', authorize('admin', 'super_admin'), createSubjectValidation, SchoolController.createSubject);

/**
 * @route   GET /api/school/subjects
 * @desc    Get all subjects (filter by ?type=theory)
 * @access  Private
 */
router.get('/subjects', ...paginationQuery, validate, SchoolController.getSubjects);

module.exports = router;
