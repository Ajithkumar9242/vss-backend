const router = require('express').Router();
const ParentController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam } = require('../../utils/validators');

router.use(protect);

/**
 * @route   PATCH /api/parents/profile/me
 * @desc    Self-service: parent updates own phone / email / address / occupation
 * @access  Private (any authenticated user with a parent record)
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

router.post(
  '/',
  authorize('admin', 'super_admin', 'principal'),
  [
    body('name').trim().notEmpty().withMessage('Parent name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('email').optional().isEmail().withMessage('Valid email required'),
  ],
  validate,
  ParentController.create
);

router.get('/', ParentController.getAll);
router.get('/:id', mongoIdParam('id'), validate, ParentController.getById);

router.patch(
  '/:id/link',
  authorize('admin', 'super_admin', 'principal'),
  [
    mongoIdParam('id'),
    body('studentId').isMongoId().withMessage('Valid student ID is required'),
  ],
  validate,
  ParentController.linkStudent
);

/**
 * PATCH /api/parents/:id
 * Admin partial update (photo, etc.)
 */
router.patch(
  '/:id',
  authorize('admin', 'super_admin', 'principal'),
  mongoIdParam('id'),
  validate,
  ParentController.update
);

module.exports = router;
