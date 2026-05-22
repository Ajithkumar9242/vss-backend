const router = require('express').Router();
const c = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
router.use(protect);

router.post('/', authorize('admin', 'super_admin', 'principal', 'faculty'), c.create);
router.get('/', c.getAll);
router.get('/student/:studentId', c.getByStudent);

module.exports = router;
