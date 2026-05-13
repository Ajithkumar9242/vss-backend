const router = require('express').Router();
const SearchController = require('./controller');
const { protect } = require('../../middlewares/auth');

router.use(protect);

router.get('/', SearchController.search);

module.exports = router;
