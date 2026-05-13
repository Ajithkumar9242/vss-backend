const router = require('express').Router();
const ActivityController = require('./controller');
const { protect } = require('../../middlewares/auth');
const { validate, mongoIdParam } = require('../../utils/validators');

router.use(protect);

router.get('/recent', ActivityController.getRecent);
router.get('/student/:studentId', mongoIdParam('studentId'), validate, ActivityController.getByStudent);

module.exports = router;
