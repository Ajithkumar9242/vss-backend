const express = require('express');
const C = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(protect);
router.use(authorize('admin', 'super_admin', 'visitor'));

// ─── School Setting ──────────────────────────────────────────
router.get('/school-setting', C.getSchoolSetting);
router.put('/school-setting', C.upsertSchoolSetting);
router.post('/school-setting/logo', upload.single('logo'), C.uploadLogo);
router.get('/message-templates', C.getMessageTemplates);
router.put('/message-templates', C.upsertMessageTemplates);

// ─── Academic Year ───────────────────────────────────────────
router.post('/academic-years', C.createAcademicYear);
router.get('/academic-years', C.getAcademicYears);
router.get('/academic-years/active', C.getActiveAcademicYear);
router.put('/academic-years/:id', C.updateAcademicYear);

// ─── Academic Terms ──────────────────────────────────────────
router.post('/terms', C.createTerm);
router.get('/terms', C.getTerms);
router.put('/terms/:id', C.updateTerm);
router.delete('/terms/:id', C.deleteTerm);

// ─── Class Config ─────────────────────────────────────────────
router.post('/class-configs', C.upsertClassConfig);
router.get('/class-configs', C.getClassConfigs);

// ─── Class Groups ─────────────────────────────────────────────
router.post('/class-groups', C.createClassGroup);
router.get('/class-groups', C.getClassGroups);
router.put('/class-groups/:id', C.updateClassGroup);
router.delete('/class-groups/:id', C.deleteClassGroup);



// ─── Grade Config ─────────────────────────────────────────────
router.post('/grades', C.createGradeConfig);
router.get('/grades', C.getGradeConfigs);
router.put('/grades/:id', C.updateGradeConfig);
router.delete('/grades/:id', C.deleteGradeConfig);

// ─── Attendance Config ────────────────────────────────────────
router.put('/attendance-config', C.upsertAttendanceConfig);
router.get('/attendance-config', C.getAttendanceConfig);

// ─── Payment Settings ─────────────────────────────────────────
router.get('/payment-settings', C.getPaymentSettings);
router.put('/payment-settings', C.upsertPaymentSettings);

// ─── Sections alias ───────────────────────────────────────────
// Frontend historically called /api/setup/sections?classId=...
// The actual route lives at /api/school/sections — proxy it here.
const SchoolController = require('../school/controller');
router.get('/sections', SchoolController.getSections);

// ─── Academic Years alias (also used by some frontend pages) ─
router.get('/classes', require('../school/controller').getClasses);

module.exports = router;
