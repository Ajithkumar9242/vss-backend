'use strict';

const router = require('express').Router();
const { protect, authorize } = require('../../middlewares/auth');
const InvoiceRegistryController = require('./controller');

const ADMIN_ROLES = ['admin', 'super_admin', 'principal', 'accountant'];


router.use(protect);
router.use(authorize(...ADMIN_ROLES));

router.get('/',              InvoiceRegistryController.list);
router.get('/:id',           InvoiceRegistryController.getDetail);
router.post('/:id/cancel',   InvoiceRegistryController.cancelInvoice);
router.get('/:id/audit',     InvoiceRegistryController.getAuditLogs);

module.exports = router;
