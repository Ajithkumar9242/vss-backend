const router = require('express').Router();
const c = require('./controller');
const { protect } = require('../../middlewares/auth');
router.use(protect);

router.post('/', c.create);
router.get('/', c.getAll);
router.get('/student/:studentId', c.getByStudent);

module.exports = router;
