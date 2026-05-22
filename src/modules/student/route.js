const router = require('express').Router();
const StudentController = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, validate, query, mongoIdParam, paginationQuery } = require('../../utils/validators');

// ─── All student routes require authentication ──────────────
router.use(protect);

// Role groups:
//   READONLY: accountant can VIEW students but not add/edit/delete
//   WRITE:    principal/admin/super_admin can fully manage
const READONLY_ROLES = ['super_admin', 'admin', 'principal', 'accountant', 'faculty', 'visitor'];
const WRITE_ROLES = ['super_admin', 'admin', 'principal'];

/**
 * GET /api/students
 * All desktop staff roles (incl. accountant) can view student list.
 */
router.get(
    '/',
    authorize(...READONLY_ROLES),
    [
        ...paginationQuery,
        query('classId')
            .optional({ values: 'falsy' })
            .isMongoId()
            .withMessage('Invalid classId format'),
        query('sectionId')
            .optional({ values: 'falsy' })
            .isMongoId()
            .withMessage('Invalid sectionId format'),
    ],
    validate,
    StudentController.getAll
);

/**
 * GET /api/students/:id/profile
 * Get aggregate profile: student, admission, attendance summary, fee summary
 */
router.get('/:id/profile', authorize(...READONLY_ROLES), mongoIdParam('id'), validate, StudentController.getProfile);

/**
 * GET /api/students/:id
 * Same read-access as above.
 */
router.get('/:id', authorize(...READONLY_ROLES), mongoIdParam('id'), validate, StudentController.getById);

/**
 * POST /api/students
 * Create a student directly — admin/principal only.
 */
const createStudentValidation = [
    body('name').trim().notEmpty().withMessage('Student name is required'),
    body('dateOfBirth').notEmpty().isISO8601().withMessage('Valid date of birth is required'),
    body('gender').isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
    body('classId').notEmpty().isMongoId().withMessage('Valid class ID is required'),
    body('sectionId').optional({ values: 'null' }).isMongoId().withMessage('Invalid section ID'),
    body('parentName').trim().notEmpty().withMessage('Parent name is required'),
    body('parentPhone').trim().notEmpty().withMessage('Parent phone is required'),
    body('parentEmail').optional().isEmail().withMessage('Invalid email'),
    body('address').optional().trim(),
    body('bloodGroup').optional().trim(),
    validate,
];
router.post('/', authorize(...WRITE_ROLES), createStudentValidation, StudentController.create);

/**
 * GET /api/students/sample-csv
 * Download the CSV import template — must be before /:id routes.
 */
router.get('/sample-csv', authorize(...WRITE_ROLES), StudentController.getSampleCsv);

/**
 * POST /api/students/bulk-import
 * Bulk create students from parsed CSV row objects.
 * Body: { rows: Array<Object> }
 * Must be before /:id routes.
 */
router.post(
    '/bulk-import',
    authorize(...WRITE_ROLES),
    [
        body('rows').isArray({ min: 1, max: 1000 }).withMessage('rows must be an array of 1–1000 items'),
        validate,
    ],
    StudentController.bulkImport
);

/**
 * PATCH /api/students/:id
 * Partial update — admin/principal only.
 */
router.patch(
    '/:id',
    authorize(...WRITE_ROLES),
    mongoIdParam('id'),
    validate,
    StudentController.update
);

module.exports = router;
