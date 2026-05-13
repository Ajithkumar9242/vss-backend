/**
 * Basic Rate Limiter Middleware
 * In-memory IP-based rate limiting. No external dependencies.
 * Each call to rateLimiter() creates an ISOLATED store — limiters never share counters.
 *
 * Usage:
 *   app.use('/api/auth', rateLimiter({ windowMs: 60000, max: 20 }));
 *   app.use(rateLimiter()); // default: 100 requests per minute
 */
const ApiResponse = require('../utils/apiResponse');

/**
 * @param {Object} options
 * @param {number} options.windowMs - Time window in ms (default: 60000 = 1 min)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message when limited
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = 'Too many requests. Please try again later.',
  } = options;

  // ── Each limiter instance gets its OWN isolated store ──────────────
  // CRITICAL FIX: The old code used a single shared module-level Map,
  // meaning otpSendRateLimit and otpVerifyRateLimit shared the same
  // counter per IP. Sending 1 OTP consumed a verify slot too.
  const store = new Map();

  // Cleanup stale entries every 5 minutes (per-instance, not shared)
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store.entries()) {
      if (now > data.resetTime) store.delete(ip);
    }
  }, 5 * 60 * 1000);

  // Allow GC to collect this interval when the server shuts down
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    if (!store.has(ip) || now > store.get(ip).resetTime) {
      store.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const entry = store.get(ip);
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    if (entry.count > max) {
      return ApiResponse.error(res, message, 429);
    }

    next();
  };
};

module.exports = rateLimiter;
