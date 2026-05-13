/**
 * Request Logger Middleware
 * Logs method, URL, status code, and response time for every request.
 * Lightweight alternative to morgan for structured logging.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;

    // Color code by status
    let statusColor;
    if (status >= 500) statusColor = '\x1b[31m';      // red
    else if (status >= 400) statusColor = '\x1b[33m';  // yellow
    else if (status >= 300) statusColor = '\x1b[36m';  // cyan
    else statusColor = '\x1b[32m';                     // green

    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    console.log(
      `${dim}[${new Date().toISOString()}]${reset} ${method.padEnd(6)} ${url} ${statusColor}${status}${reset} ${dim}${duration}ms${reset}`
    );
  });

  next();
};

module.exports = requestLogger;
