const crypto = require('crypto');
const ApiResponse = require('../utils/apiResponse');

/**
 * Idempotency Middleware — prevents duplicate POST submissions.
 *
 * Creates a fingerprint from IP + URL + body hash and deduplicates
 * within a configurable time window (default: 5 seconds).
 *
 * Usage:
 *   router.post('/pay', idempotency(), FeesController.recordPayment);
 *   router.post('/pay', idempotency({ windowMs: 10000 }), ...);
 */

// Store: { fingerprint: timestamp }
const dedupeStore = new Map();

// Cleanup stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of dedupeStore.entries()) {
    if (now - ts > 30000) {
      dedupeStore.delete(key);
    }
  }
}, 60 * 1000);

/**
 * @param {Object} options
 * @param {number} options.windowMs - Dedup window in ms (default: 5000)
 */
const idempotency = (options = {}) => {
  const { windowMs = 5000 } = options;

  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const bodyStr = JSON.stringify(req.body || {});
      const hash = crypto.createHash('md5').update(bodyStr).digest('hex');
      const fingerprint = `${ip}:${req.originalUrl}:${hash}`;

      const lastSeen = dedupeStore.get(fingerprint);
      const now = Date.now();

      if (lastSeen && now - lastSeen < windowMs) {
        return ApiResponse.error(
          res,
          'Duplicate request detected. Please wait before submitting again.',
          409
        );
      }

      dedupeStore.set(fingerprint, now);
      next();
    } catch {
      // If fingerprinting fails, let the request through
      next();
    }
  };
};

module.exports = idempotency;
