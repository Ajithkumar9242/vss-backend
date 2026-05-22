'use strict';

const router = require('express').Router();
const { protect, authorize } = require('../../middlewares/auth');
const InvoiceRegistryController = require('./controller');

const ALL_ROLES = ['admin', 'super_admin', 'principal', 'accountant', 'visitor'];
const WRITE_ROLES = ['admin', 'super_admin', 'principal', 'accountant'];


router.use(protect);

router.get('/', authorize(...ALL_ROLES), InvoiceRegistryController.list);
router.get('/:id', authorize(...ALL_ROLES), InvoiceRegistryController.getDetail);
router.post('/:id/cancel', authorize(...WRITE_ROLES), InvoiceRegistryController.cancelInvoice);
router.get('/:id/audit', authorize(...ALL_ROLES), InvoiceRegistryController.getAuditLogs);

module.exports = router;
