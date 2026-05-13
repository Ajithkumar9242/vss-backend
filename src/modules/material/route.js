const router  = require('express').Router();
const C       = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam } = require('../../utils/validators');

const staff  = authorize('admin', 'super_admin', 'faculty');
const reader = authorize('admin', 'super_admin', 'faculty', 'parent', 'student');

router.use(protect);

router.post(
  '/',
  staff,
  [
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('type').isIn(['pdf','video','audio','image','link','other']).withMessage('Valid type required'),
    body('classId').isMongoId().withMessage('Valid classId required'),
    body('subjectId').isMongoId().withMessage('Valid subjectId required'),
  ],
  validate, C.create
);

router.get('/', reader, C.getAll);
router.get('/class/:classId', reader, mongoIdParam('classId'), validate, C.getByClass);
router.get('/:id', reader, mongoIdParam('id'), validate, C.getById);
router.delete('/:id', staff, mongoIdParam('id'), validate, C.remove);

module.exports = router;
