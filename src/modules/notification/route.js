const router = require('express').Router();
const NotificationController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, mongoIdParam, body } = require('../../utils/validators');

router.use(protect);

router.get('/', NotificationController.getNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/read-all', NotificationController.markAllRead);
router.patch('/:id/read', mongoIdParam('id'), validate, NotificationController.markRead);

// ─── FCM Device Token ────────────────────────────────────────
router.post('/device-token', NotificationController.saveDeviceToken);

// ─── Broadcast (admin only) ──────────────────────────────────
router.post(
  '/broadcast',
  authorize('admin', 'super_admin'),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('target').isIn(['all', 'class', 'student', 'parent', 'faculty']).withMessage('Invalid target'),
    body('classId').optional({ nullable: true }).isMongoId(),
    body('studentId').optional({ nullable: true }).isMongoId(),
    body('type').optional().isIn(['info', 'success', 'warning', 'error']),
    body('contentType').optional().isIn(['text', 'image', 'file', 'link']),
    body('contentUrl').optional({ nullable: true }).isURL(),
  ],
  validate,
  NotificationController.broadcast
);

// ─── Test Push (admin only) ──────────────────────────────────
router.post(
  '/send-test',
  authorize('admin', 'super_admin'),
  NotificationController.sendTestNotification
);

module.exports = router;
