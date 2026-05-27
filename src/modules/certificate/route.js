'use strict';

const router     = require('express').Router();
const { protect, authorize } = require('../../middlewares/auth');
const CertificateController  = require('./controller');

// Roles allowed to read templates + print
const READ_ROLES  = ['super_admin', 'admin', 'principal', 'visitor', 'accountant'];
// Roles allowed to create/edit/delete templates
const WRITE_ROLES = ['super_admin', 'admin', 'principal'];

router.use(protect);

// ── Template CRUD ─────────────────────────────────────────────────────────
router.get('/templates',     authorize(...READ_ROLES),  CertificateController.listTemplates);
router.get('/templates/:id', authorize(...READ_ROLES),  CertificateController.getTemplate);
router.post('/templates',    authorize(...WRITE_ROLES), CertificateController.createTemplate);
router.patch('/templates/:id', authorize(...WRITE_ROLES), CertificateController.updateTemplate);
router.delete('/templates/:id', authorize(...WRITE_ROLES), CertificateController.deleteTemplate);

// ── Preview (HTML variable-resolved data) ─────────────────────────────────
router.get('/preview', authorize(...READ_ROLES), CertificateController.preview);

// ── PDF download ──────────────────────────────────────────────────────────
router.get('/pdf', authorize(...READ_ROLES), CertificateController.downloadPdf);

module.exports = router;
