const router = require('express').Router();
const CommunicationController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam } = require('../../utils/validators');

router.use(protect);

router.post(
  '/',
  authorize('admin', 'super_admin', 'principal', 'teacher', 'faculty'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('targetType').isIn(['all', 'class', 'student', 'faculty']).withMessage('Target type must be all, class, student, or faculty'),
    body('targetId').optional({ nullable: true }).isMongoId().withMessage('Valid target ID required'),
    body('attachments').optional().isArray().withMessage('Attachments must be an array'),
  ],
  validate,
  CommunicationController.send
);

router.get('/', CommunicationController.getAll);
router.get('/:id', mongoIdParam('id'), validate, CommunicationController.getById);

module.exports = router;
