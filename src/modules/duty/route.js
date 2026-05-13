const router = require('express').Router();
const c = require('./controller');
const { protect } = require('../../middlewares/auth');
router.use(protect);

router.post('/', c.assign);
router.get('/', c.getAll);
router.get('/by-date', c.getByDate);

module.exports = router;
