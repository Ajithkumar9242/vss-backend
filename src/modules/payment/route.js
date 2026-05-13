const router = require('express').Router();
const PaymentController = require('./controller');
const { body, validate } = require('../../utils/validators');
const rateLimiter = require('../../middlewares/rateLimiter');

// ─── Payment routes are PUBLIC (no JWT) ─────────────────────
// Parents create payments without an account.
// Rate-limited to prevent abuse.

const paymentRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many payment requests. Please wait a moment.',
});

// ─── Validation Rules ───────────────────────────────────────
const createOrderValidation = [
  body('studentName').trim().notEmpty().withMessage('Student name is required'),
  validate,
];

const verifyValidation = [
  body('razorpay_order_id').trim().notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').trim().notEmpty().withMessage('Signature is required'),
  body('admissionData').isObject().withMessage('Admission data is required'),
  body('admissionData.studentName').trim().notEmpty().withMessage('Student name is required'),
  body('admissionData.dateOfBirth').notEmpty().withMessage('Date of birth is required'),
  body('admissionData.gender').isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  body('admissionData.classId').isMongoId().withMessage('Invalid class ID'),
  body('admissionData.parentPhone').trim().notEmpty().withMessage('Parent phone is required'),
  validate,
];

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

/**
 * @route   POST /api/payment/create-order
 * @desc    Create a Razorpay order for admission fee
 * @access  Public (rate-limited)
 */
router.post('/create-order', paymentRateLimit, createOrderValidation, PaymentController.createOrder);

/**
 * @route   POST /api/payment/verify
 * @desc    Verify payment and create admission
 * @access  Public (rate-limited)
 */
router.post('/verify', paymentRateLimit, verifyValidation, PaymentController.verifyAndCreateAdmission);

/**
 * @route   POST /api/payment/webhook
 * @desc    Razorpay webhook for payment capture fallback
 * @access  Public
 */
router.post('/webhook', PaymentController.handleWebhook);

module.exports = router;
