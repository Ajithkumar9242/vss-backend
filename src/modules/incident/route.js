const router = require('express').Router();
const c = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
router.use(protect);

router.post('/', authorize('admin', 'super_admin', 'principal', 'faculty'), c.create);
router.get('/', c.getAll);
router.patch('/:id/action', authorize('admin', 'super_admin', 'principal'), c.updateAction);
router.get('/student/:studentId', c.getByStudent);

module.exports = router;
