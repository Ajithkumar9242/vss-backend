const Razorpay = require('razorpay');
const crypto = require('crypto');
const AppError = require('../../utils/AppError');

/**
 * Payment Service — Razorpay order creation & signature verification.
 */
class PaymentService {
  /**
   * Get a configured Razorpay instance.
   * @returns {Razorpay}
   */
  static _getInstance() {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new AppError('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env', 500);
    }

    return new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  /**
   * Create a Razorpay order.
   * @param {number} amount - Amount in paise (e.g., 50000 = ₹500)
   * @param {string} studentName - Name for receipt reference
   * @param {string} [receipt] - Optional receipt ID
   * @returns {{ orderId: string, amount: number, currency: string }}
   */
  static async createOrder(amount, studentName, receipt) {
    if (!amount || amount < 100) {
      throw new AppError('Amount must be at least ₹1 (100 paise)', 400);
    }

    const razorpay = PaymentService._getInstance();

    const receiptId = receipt || `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const options = {
      amount: Math.round(amount), // Razorpay expects integer paise
      currency: 'INR',
      receipt: receiptId,
      notes: {
        studentName,
        purpose: 'Admission Application Fee',
      },
    };

    try {
      const order = await razorpay.orders.create(options);

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      };
    } catch (error) {
      console.error('❌ Razorpay order creation failed:', error);
      throw new AppError('Failed to create payment order. Please try again.', 500);
    }
  }

  /**
   * Verify Razorpay payment signature.
   * Uses HMAC-SHA256 with the key secret.
   *
   * @param {string} razorpay_order_id
   * @param {string} razorpay_payment_id
   * @param {string} razorpay_signature
   * @returns {boolean} true if signature is valid
   */
  static verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing payment verification parameters', 400);
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new AppError('Razorpay secret not configured', 500);
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return expectedSignature === razorpay_signature;
  }
}

module.exports = PaymentService;
