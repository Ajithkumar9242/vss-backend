const router = require('express').Router();
const c = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
router.use(protect);

router.post('/', authorize('admin', 'super_admin', 'principal'), c.assign);
router.get('/', c.getAll);
router.get('/by-date', c.getByDate);

module.exports = router;
