const router = require('express').Router();
const SubjectController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, param, query, validate, mongoIdParam, paginationQuery } = require('../../utils/validators');

// ─── All subject routes require authentication ──────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════
//  VALIDATION CHAINS
// ═══════════════════════════════════════════════════════════

const createValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Subject name is required')
    .isLength({ max: 100 }).withMessage('Name must be at most 100 characters'),
  body('code')
    .trim()
    .notEmpty().withMessage('Subject code is required')
    .isLength({ max: 20 }).withMessage('Code must be at most 20 characters'),
  body('type')
    .optional()
    .isIn(['theory', 'practical', 'elective']).withMessage('Type must be theory, practical, or elective'),
  body('classId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('Invalid classId format'),
  body('isOptional')
    .optional()
    .isBoolean().withMessage('isOptional must be a boolean'),
  validate,
];

const updateValidation = [
  mongoIdParam('id'),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 100 }),
  body('code')
    .optional()
    .trim()
    .notEmpty().withMessage('Code cannot be empty')
    .isLength({ max: 20 }),
  body('type')
    .optional()
    .isIn(['theory', 'practical', 'elective']).withMessage('Type must be theory, practical, or elective'),
  body('classId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('Invalid classId format'),
  body('isOptional')
    .optional()
    .isBoolean(),
  body('isActive')
    .optional()
    .isBoolean(),
  validate,
];

const listValidation = [
  ...paginationQuery,
  query('classId')
    .optional({ values: 'falsy' })
    .isMongoId().withMessage('Invalid classId format'),
  query('type')
    .optional()
    .isIn(['theory', 'practical', 'elective']).withMessage('Invalid type filter'),
  query('isActive')
    .optional()
    .isIn(['true', 'false']).withMessage('isActive must be true or false'),
  validate,
];

const assignValidation = [
  mongoIdParam('id'),
  body('classConfigId')
    .notEmpty().withMessage('classConfigId is required')
    .isMongoId().withMessage('Invalid classConfigId'),
  body('action')
    .notEmpty().withMessage('action is required')
    .isIn(['add', 'remove']).withMessage("action must be 'add' or 'remove'"),
  validate,
];

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

/**
 * @route   POST /api/subjects
 * @desc    Create a new subject
 * @access  Admin, super_admin
 */
router.post(
  '/',
  authorize('admin', 'super_admin', 'principal'),
  createValidation,
  SubjectController.create
);

/**
 * @route   GET /api/subjects
 * @desc    List subjects — supports ?classId, ?type, ?isActive, ?search, ?page, ?limit
 * @access  All authenticated users
 */
router.get('/', listValidation, SubjectController.getAll);

/**
 * @route   PUT /api/subjects/:id
 * @desc    Update a subject
 * @access  Admin, super_admin
 */
router.put(
  '/:id',
  authorize('admin', 'super_admin', 'principal'),
  updateValidation,
  SubjectController.update
);

/**
 * @route   DELETE /api/subjects/:id
 * @desc    Soft-delete a subject (sets isActive = false)
 * @access  Admin, super_admin
 */
router.delete(
  '/:id',
  authorize('admin', 'super_admin', 'principal'),
  [mongoIdParam('id'), validate],
  SubjectController.softDelete
);

/**
 * @route   PATCH /api/subjects/:id/toggle
 * @desc    Toggle isActive status
 * @access  Admin, super_admin
 */
router.patch(
  '/:id/toggle',
  authorize('admin', 'super_admin', 'principal'),
  [mongoIdParam('id'), validate],
  SubjectController.toggle
);

/**
 * @route   POST /api/subjects/:id/assign
 * @desc    Add / remove subject from a ClassConfig
 * @body    { classConfigId, action: 'add'|'remove' }
 * @access  Admin, super_admin
 */
router.post(
  '/:id/assign',
  authorize('admin', 'super_admin', 'principal'),
  assignValidation,
  SubjectController.assignToClassConfig
);

module.exports = router;
