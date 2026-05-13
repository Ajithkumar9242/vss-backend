/**
 * Query & Body Sanitizer Middleware
 * Strips undefined, null, and empty-string values from req.query and req.body.
 * Prevents invalid params from reaching validation or service layers.
 */
const sanitize = (req, res, next) => {
  // Clean query params
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      const val = req.query[key];
      if (val === undefined || val === null || val === '' || val === 'undefined' || val === 'null') {
        delete req.query[key];
      }
    }
  }

  // Clean body (shallow — deep nested objects are left to Mongoose validation)
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (val === undefined || val === null || val === 'undefined' || val === 'null') {
        delete req.body[key];
      }
    }
  }

  next();
};

module.exports = sanitize;
