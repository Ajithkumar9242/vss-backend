'use strict';

const router = require('express').Router();
const C = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { body, param, validate, mongoIdParam } = require('../../utils/validators');

// Role groups
// WRITE: admin, super_admin, principal only
// READ:  all staff + visitor (for browsing)
const WRITE_ROLES = ['admin', 'super_admin', 'principal'];
const READ_ROLES  = ['admin', 'super_admin', 'principal', 'accountant', 'faculty', 'visitor', 'parent', 'student'];

router.use(protect);

const createUpdateValidation = [
  body('academicYearId').isMongoId().withMessage('Valid academicYearId required'),
  body('classId').isMongoId().withMessage('Valid classId required'),
  body('sectionId').optional({ nullable: true }).isMongoId(),
  body('dayOfWeek').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).withMessage('Valid day required'),
  body('periodNo').isInt({ min: 1, max: 12 }).withMessage('Period must be 1–12'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be HH:MM'),
  body('endTime').matches(/^\d{2}:\d{2}$/).withMessage('endTime must be HH:MM'),
  body('subjectId').isMongoId().withMessage('Valid subjectId required'),
  body('facultyId').optional({ nullable: true }).isMongoId(),
  body('room').optional().trim(),
  body('term').optional().isIn(['term1', 'term2', 'full']),
  validate,
];

// ── List all (filterable by classId / facultyId / day / academicYearId)
router.get('/', authorize(...READ_ROLES), C.getAll);

// ── Class timetable
router.get('/class/:classId', authorize(...READ_ROLES), mongoIdParam('classId'), validate, C.getByClass);

// ── Faculty timetable
router.get('/faculty/:facultyId', authorize(...READ_ROLES), mongoIdParam('facultyId'), validate, C.getByFaculty);

// ── Create
router.post('/', authorize(...WRITE_ROLES), createUpdateValidation, C.create);

// ── Update
router.put('/:id', authorize(...WRITE_ROLES), mongoIdParam('id'), validate, C.update);

// ── Delete (soft)
router.delete('/:id', authorize(...WRITE_ROLES), mongoIdParam('id'), validate, C.remove);

module.exports = router;
