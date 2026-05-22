'use strict';

const router = require('express').Router();
const { protect, authorize } = require('../../middlewares/auth');
const PosController = require('./controller');

const ALL_POS_ROLES = ['admin', 'super_admin', 'principal', 'accountant', 'visitor'];
const WRITE_POS_ROLES = ['admin', 'super_admin', 'principal', 'accountant'];


router.use(protect);

// ── Catalog ──────────────────────────────────────────────
router.get('/catalog', authorize(...ALL_POS_ROLES), PosController.listCatalog);
router.post('/catalog', authorize(...WRITE_POS_ROLES), PosController.createItem);
router.put('/catalog/:id', authorize(...WRITE_POS_ROLES), PosController.updateItem);
router.patch('/catalog/:id/toggle', authorize(...WRITE_POS_ROLES), PosController.toggleItem);

// ── Invoices ─────────────────────────────────────────────
router.post('/invoices', authorize(...WRITE_POS_ROLES), PosController.createInvoice);
router.get('/invoices', authorize(...ALL_POS_ROLES), PosController.listInvoices);
router.get('/invoices/:id', authorize(...ALL_POS_ROLES), PosController.getInvoice);
router.get('/invoices/:id/pdf', authorize(...ALL_POS_ROLES), PosController.getInvoicePdf);
router.post('/invoices/:id/cancel', authorize(...WRITE_POS_ROLES), PosController.cancelInvoice);

module.exports = router;
