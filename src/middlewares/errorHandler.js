const ApiResponse = require('../utils/apiResponse');

/**
 * Global error handler middleware.
 * Converts ALL error types into a consistent { success, data, message } format.
 * Never exposes stack traces in production.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // ─── Mongoose validation error ────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const messages = Object.values(err.errors).map((e) => e.message);
    message = messages.join(', ');
  }

  // ─── Mongoose duplicate key error ─────────────────────────
  if (err.code === 11000) {
    statusCode = 400;
    const fields = Object.keys(err.keyValue || {});
    if (fields.length > 1) {
      // Compound index (e.g. name + term + class + year)
      message = `An entry with this combination of ${fields.join(', ')} already exists.`;
    } else {
      // Single field index
      const field = fields[0] || 'field';
      message = `Duplicate value for '${field}'. Please use a different value.`;
    }
  }

  // ─── Mongoose bad ObjectId ────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path || 'ID'} format`;
  }

  // ─── JWT errors ───────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please login again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired. Please login again.';
  }

  // ─── Express body-parser / syntax errors ──────────────────
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  // ─── Payload too large ────────────────────────────────────
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload too large';
  }

  // ─── TypeError / RangeError (programming errors) ──────────
  if (err instanceof TypeError || err instanceof RangeError) {
    statusCode = 500;
    message = 'An unexpected error occurred';
  }

  // ─── Mongo server errors (timeout, connection) ────────────
  if (err.name === 'MongoServerError' && err.code !== 11000) {
    statusCode = 503;
    message = 'Database temporarily unavailable. Please try again.';
  }

  // ─── Log all errors ───────────────────────────────────────
  console.error(`❌ [${statusCode}] ${message}`);
  if (statusCode === 500 && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // ─── Never expose raw error details in production ─────────
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
  }

  return ApiResponse.error(res, message, statusCode);
};

/**
 * 404 Not Found handler.
 */
const notFound = (req, res, next) => {
  return ApiResponse.error(res, `Route not found: ${req.originalUrl}`, 404);
};

module.exports = { errorHandler, notFound };
