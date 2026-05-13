const router = require('express').Router();
const c = require('./controller');
const { protect } = require('../../middlewares/auth');
router.use(protect);

router.post('/', c.create);
router.get('/', c.getAll);
router.patch('/:id/approve', c.approve);
router.patch('/:id/reject', c.reject);
router.patch('/:id/mark-out', c.markOut);
router.patch('/:id/mark-in', c.markIn);

module.exports = router;
