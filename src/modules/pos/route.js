'use strict';

const router = require('express').Router();
const { protect, authorize } = require('../../middlewares/auth');
const PosController = require('./controller');

const ADMIN_ROLES = ['admin', 'super_admin', 'principal', 'accountant', 'visitor'];


router.use(protect);
router.use(authorize(...ADMIN_ROLES));

// ── Catalog ──────────────────────────────────────────────
router.get('/catalog', PosController.listCatalog);
router.post('/catalog', PosController.createItem);
router.put('/catalog/:id', PosController.updateItem);
router.patch('/catalog/:id/toggle', PosController.toggleItem);

// ── Invoices ─────────────────────────────────────────────
router.post('/invoices', PosController.createInvoice);
router.get('/invoices', PosController.listInvoices);
router.get('/invoices/:id', PosController.getInvoice);
router.get('/invoices/:id/pdf', PosController.getInvoicePdf);
router.post('/invoices/:id/cancel', PosController.cancelInvoice);

module.exports = router;
