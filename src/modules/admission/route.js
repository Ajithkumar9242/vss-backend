const router = require('express').Router();
const AdmissionController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, validate, mongoIdParam, paginationQuery, query } = require('../../utils/validators');
const rateLimiter = require('../../middlewares/rateLimiter');

const publicRateLimit = rateLimiter({ windowMs: 60 * 1000, max: 20, message: 'Too many requests.' });
const formRateLimit   = rateLimiter({ windowMs: 60 * 1000, max: 5,  message: 'Too many submissions. Please wait.' });

// ═══════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════

/** GET /api/admissions/classes — for public form dropdown */
router.get('/classes', publicRateLimit, AdmissionController.getPublicClasses);

/** GET /api/admissions/settings — check if admissions are open */
router.get('/settings', publicRateLimit, AdmissionController.getSettings);

/** GET /api/admissions/status/:applicationNo */
router.get('/status/:applicationNo', publicRateLimit, AdmissionController.getByApplicationNo);

/** GET /api/admissions/search?phone=xxx */
router.get('/search', publicRateLimit, [
  query('phone').trim().notEmpty().withMessage('Phone number is required'),
  validate,
], AdmissionController.searchByPhone);

/** POST /api/admissions/public — online admission form submission */
router.post('/public', formRateLimit, [
  body('studentName').trim().notEmpty().withMessage('Student name is required'),
  body('dateOfBirth').notEmpty().isISO8601().withMessage('Valid date of birth is required'),
  body('gender').notEmpty().isIn(['male', 'female', 'other']).withMessage('Gender is required'),
  body('classId').notEmpty().isMongoId().withMessage('Class is required'),
  body('parentPhone').trim().notEmpty().withMessage('Parent phone is required'),
  validate,
], AdmissionController.submitPublic);

// ═══════════════════════════════════════════════════════════
//  PROTECTED ROUTES
// ═══════════════════════════════════════════════════════════
router.use(protect);

/** PATCH /api/admissions/settings — admin toggle open/close */
router.patch('/settings',
  authorize('admin', 'super_admin'),
  [
    body('admissionsOpen').optional().isBoolean().withMessage('admissionsOpen must be boolean'),
    body('activeAdmissionAcademicYearId').optional({ nullable: true }).isMongoId().withMessage('Invalid academic year ID'),
    validate,
  ],
  AdmissionController.updateSettings
);

/** POST /api/admissions — offline admin-created application */
router.post('/',
  authorize('admin', 'super_admin'),
  [
    body('studentName').trim().notEmpty().withMessage('Student name is required'),
    body('dateOfBirth').notEmpty().isISO8601().withMessage('Valid date of birth is required'),
    body('gender').notEmpty().isIn(['male', 'female', 'other']).withMessage('Gender is required'),
    body('classId').notEmpty().isMongoId().withMessage('Class is required'),
    body('sectionId').optional({ values: 'null' }).isMongoId(),
    body('parentName').trim().notEmpty().withMessage('Parent name is required'),
    body('parentPhone').trim().notEmpty().withMessage('Parent phone is required'),
    body('parentEmail').optional().isEmail(),
    validate,
  ],
  AdmissionController.create
);

/** GET /api/admissions */
router.get('/', ...paginationQuery, validate, AdmissionController.getAll);

/** GET /api/admissions/:id */
router.get('/:id', mongoIdParam('id'), validate, AdmissionController.getById);

/** PATCH /api/admissions/:id — edit application */
router.patch('/:id',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'), validate,
  AdmissionController.update
);

/** PATCH /api/admissions/:id/approve */
router.patch('/:id/approve',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'), validate,
  AdmissionController.approve
);

/** PATCH /api/admissions/:id/reject */
router.patch('/:id/reject',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'),
  [body('remarks').optional().trim(), validate],
  AdmissionController.reject
);

/** PATCH /api/admissions/:id/hold */
router.patch('/:id/hold',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'),
  [body('remarks').optional().trim(), validate],
  AdmissionController.hold
);

module.exports = router;
