const router = require('express').Router();
const ParentController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam } = require('../../utils/validators');

router.use(protect);

// Role groups
const READONLY_ROLES = ['super_admin', 'admin', 'principal', 'accountant'];
const WRITE_ROLES    = ['super_admin', 'admin', 'principal'];

/**
 * PATCH /api/parents/profile/me
 * Self-service: parent updates own profile — open to any authenticated user.
 */
router.patch(
  '/profile/me',
  [
    body('phone').optional().trim().isLength({ min: 7, max: 15 }).withMessage('Phone must be 7–15 characters'),
    body('email').optional().trim().isEmail().withMessage('Valid email required'),
    body('address').optional().trim().isLength({ max: 300 }).withMessage('Address too long'),
    body('occupation').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  ParentController.updateMyProfile
);

/**
 * POST /api/parents
 * Create a parent record — admin/principal only.
 */
router.post(
  '/',
  authorize(...WRITE_ROLES),
  [
    body('name').trim().notEmpty().withMessage('Parent name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('email').optional().isEmail().withMessage('Valid email required'),
  ],
  validate,
  ParentController.create
);

/**
 * GET /api/parents
 * List all parents — accountant + admin + principal can view.
 */
router.get('/', authorize(...READONLY_ROLES), ParentController.getAll);
router.get('/:id', authorize(...READONLY_ROLES), mongoIdParam('id'), validate, ParentController.getById);

/**
 * PATCH /api/parents/:id/link
 * Link a student to a parent — admin/principal only.
 */
router.patch(
  '/:id/link',
  authorize(...WRITE_ROLES),
  [
    mongoIdParam('id'),
    body('studentId').isMongoId().withMessage('Valid student ID is required'),
  ],
  validate,
  ParentController.linkStudent
);

/**
 * PATCH /api/parents/:id
 * Admin partial update — admin/principal only.
 */
router.patch(
  '/:id',
  authorize(...WRITE_ROLES),
  mongoIdParam('id'),
  validate,
  ParentController.update
);

module.exports = router;
