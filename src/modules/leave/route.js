const router = require('express').Router();
const c = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
router.use(protect);

router.post('/', authorize('admin', 'super_admin', 'principal', 'faculty', 'parent', 'student'), c.create);
router.get('/', c.getAll);
router.patch('/:id/approve', authorize('admin', 'super_admin', 'principal', 'faculty'), c.approve);
router.patch('/:id/reject', authorize('admin', 'super_admin', 'principal', 'faculty'), c.reject);
router.patch('/:id/mark-out', authorize('admin', 'super_admin', 'principal', 'faculty'), c.markOut);
router.patch('/:id/mark-in', authorize('admin', 'super_admin', 'principal', 'faculty'), c.markIn);

module.exports = router;
