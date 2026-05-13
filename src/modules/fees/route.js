'use strict';

const router      = require('express').Router();
const C           = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');
const { validate, body, mongoIdParam } = require('../../utils/validators');
const idempotency = require('../../middlewares/idempotency');

router.use(protect);

// ─── Health ───────────────────────────────────────────────────
router.get('/health', C.health);

// ═══════════════════════════════════════════════════════════
//  FEE COMPONENTS
// ═══════════════════════════════════════════════════════════
router.get('/components',       C.getComponents);
router.get('/components/:id',   mongoIdParam('id'), validate, C.getComponent);

router.post(
  '/components',
  authorize('admin', 'super_admin', 'principal'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('code').notEmpty().withMessage('Code is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be non-negative'),
    body('mandatory').optional().isBoolean(),
    body('recurringType').optional().isIn(['yearly', 'monthly', 'quarterly', 'one_time']),
    body('active').optional().isBoolean(),
  ],
  validate,
  C.createComponent
);

router.put(
  '/components/:id',
  authorize('admin', 'super_admin', 'principal'),
  mongoIdParam('id'), validate,
  C.updateComponent
);

router.patch(
  '/components/:id/toggle',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'), validate,
  C.toggleComponent
);

router.delete(
  '/components/:id',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'), validate,
  C.deleteComponent
);

// ═══════════════════════════════════════════════════════════
//  STUDENT FEE PROFILES
// ═══════════════════════════════════════════════════════════
router.get(
  '/profiles/class/:classId',
  mongoIdParam('classId'), validate,
  C.getClassMatrix
);

router.post(
  '/profiles/bulk-save',
  authorize('admin', 'super_admin', 'principal'),
  [
    body('classId').isMongoId().withMessage('Valid class ID is required'),
    body('rows').isArray({ min: 1 }).withMessage('rows must be a non-empty array'),
    body('rows.*.studentId').isMongoId().withMessage('Each row needs a valid studentId'),
    body('rows.*.selectedComponentIds').optional().isArray(),
  ],
  validate,
  C.bulkSaveProfiles
);

router.get(
  '/profiles/student/:studentId',
  mongoIdParam('studentId'), validate,
  C.getStudentProfile
);

router.post(
  '/profiles/student/:studentId/discount',
  authorize('admin', 'super_admin', 'principal'),
  mongoIdParam('studentId'),
  [
    body('type').isIn(['scholarship', 'sibling', 'staff_child', 'custom']).withMessage('Invalid discount type'),
    body('discountType').isIn(['percent', 'fixed']).withMessage('discountType must be percent or fixed'),
    body('value').isFloat({ min: 0 }).withMessage('Value must be non-negative'),
  ],
  validate,
  C.addDiscount
);

router.post(
  '/profiles/student/:studentId/lock',
  authorize('admin', 'super_admin'),
  mongoIdParam('studentId'), validate,
  C.lockProfile
);

router.post(
  '/profiles/student/:studentId/unlock',
  authorize('admin', 'super_admin'),
  mongoIdParam('studentId'), validate,
  C.unlockProfile
);

// ═══════════════════════════════════════════════════════════
//  INVOICE
// ═══════════════════════════════════════════════════════════
router.post(
  '/invoice/generate',
  authorize('admin', 'super_admin', 'principal'),
  [body('studentId').isMongoId().withMessage('Valid studentId required')],
  validate,
  C.generateInvoice
);

router.get('/invoice/:studentId',     mongoIdParam('studentId'), validate, C.getInvoice);
router.get('/invoices/:invoiceId',    mongoIdParam('invoiceId'), validate, C.getInvoiceById);

// ─── Pay an installment ───────────────────────────────────
router.post(
  '/invoices/:invoiceId/pay',
  authorize('admin', 'super_admin', 'principal'),
  idempotency(),
  mongoIdParam('invoiceId'),
  [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least ₹1'),
    body('paymentMode')
      .isIn(['cash', 'upi', 'online', 'razorpay', 'cheque', 'bank_transfer'])
      .withMessage('Invalid payment mode'),
    body('installmentId').optional().isMongoId(),
    body('transactionId').optional().isString(),
  ],
  validate,
  C.recordInstallmentPayment
);

// ─── Penalty ──────────────────────────────────────────────
router.post(
  '/invoices/:invoiceId/penalty',
  authorize('admin', 'super_admin', 'principal'),
  mongoIdParam('invoiceId'),
  [
    body('type').isIn(['fixed', 'percent']).withMessage('type must be fixed or percent'),
    body('value').isFloat({ min: 0 }).withMessage('value must be non-negative'),
  ],
  validate,
  C.applyPenalty
);

router.put(
  '/invoices/:invoiceId/penalty/waive',
  authorize('admin', 'super_admin', 'principal'),
  mongoIdParam('invoiceId'),
  [body('waiveAmount').optional().isFloat({ min: 0 })],
  validate,
  C.waivePenalty
);

// ─── Schedule Regeneration ────────────────────────────────
router.post(
  '/invoices/:id/regenerate-schedule',
  authorize('admin', 'super_admin'),
  mongoIdParam('id'), validate,
  C.regenerateSchedule
);

// ─── Locking ──────────────────────────────────────────────
router.post(
  '/invoices/:invoiceId/lock',
  authorize('admin', 'super_admin'),
  mongoIdParam('invoiceId'), validate,
  C.lockInvoice
);

router.post(
  '/invoices/:invoiceId/unlock',
  authorize('admin', 'super_admin'),
  mongoIdParam('invoiceId'), validate,
  C.unlockInvoice
);

// ─── PDF ──────────────────────────────────────────────────
router.get('/invoices/:invoiceId/pdf', mongoIdParam('invoiceId'), validate, C.generateInvoicePDF);

// ─── Receipt PDF ──────────────────────────────────────────
router.get('/:id/receipt', mongoIdParam('id'), validate, C.generateReceipt);

// ═══════════════════════════════════════════════════════════
//  FEE OVERVIEW
// ═══════════════════════════════════════════════════════════
router.get('/overview', C.getOverview);

// ═══════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════
router.get('/analytics/dashboard',  C.getDashboardStats);
router.get('/analytics/monthly',    C.getMonthlyCollection);
router.get('/analytics/classwise',  C.getClasswiseDues);
router.get('/analytics/components', C.getComponentSummary);
router.get('/analytics/overdue',    C.getOverdueStudents);

module.exports = router;
