const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
require('dotenv').config();

// ─── Middleware imports ─────────────────────────────────────
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const sanitize = require('./middlewares/sanitize');
const requestLogger = require('./middlewares/requestLogger');
const rateLimiter = require('./middlewares/rateLimiter');

// ─── Route imports ──────────────────────────────────────────
const authRoutes = require('./modules/auth/route');
const schoolRoutes = require('./modules/school/route');
const admissionRoutes = require('./modules/admission/route');
const studentRoutes = require('./modules/student/route');
const facultyRoutes = require('./modules/faculty/route');
const attendanceRoutes = require('./modules/attendance/route');
const examRoutes = require('./modules/exam/route');
const feesRoutes = require('./modules/fees/route');
const notificationRoutes = require('./modules/notification/route');
const activityRoutes = require('./modules/activity/route');
const parentRoutes = require('./modules/parent/route');
const communicationRoutes = require('./modules/communication/route');
const searchRoutes = require('./modules/search/route');
const uploadRoutes = require('./modules/upload/route');
const hostelRoutes = require('./modules/hostel/route');
const leaveRoutes = require('./modules/leave/route');
const healthRoutes = require('./modules/health/route');
const incidentRoutes = require('./modules/incident/route');
const dutyRoutes = require('./modules/duty/route');
const paymentRoutes = require('./modules/payment/route');
const setupRoutes = require('./modules/setup/routes');
const subjectRoutes = require('./modules/subject/route');
const assignmentRoutes = require('./modules/assignment/route');
const materialRoutes   = require('./modules/material/route');
const timetableRoutes  = require('./modules/timetable/route');
const certificateRoutes = require('./modules/certificate/route');

const app = express();

// Trust proxy for accurate IP detection behind reverse proxies (Nginx, etc.)
app.set('trust proxy', 1);

// ═══════════════════════════════════════════════════════════
//  GLOBAL MIDDLEWARE (order matters)
// ═══════════════════════════════════════════════════════════

// Security headers — hardened for production
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Let frontend handle CSP
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// CORS — uses env variable for production, falls back to * for dev
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (replaces morgan)
app.use(requestLogger);

// Global query/body sanitizer — strips undefined/null/empty params
app.use(sanitize);

// Global rate limiter — 100 req/min per IP
app.use(rateLimiter({ windowMs: 60 * 1000, max: 100 }));

// ═══════════════════════════════════════════════════════════
//  ROUTE-SPECIFIC RATE LIMITING
// ═══════════════════════════════════════════════════════════

// Auth route-level OTP limits are defined in auth/route.js per route.
// No blanket /api/auth prefix limiter — it shared state with per-route limiters.


// ═══════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/hostel', hostelRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/timetable',    timetableRoutes);
app.use('/api/certificates', certificateRoutes);

// ─── New Modules ────────────────────────────────────────────
const vaultRoutes    = require('./modules/vault/route');
const posRoutes      = require('./modules/pos/route');
const invoiceRoutes  = require('./modules/invoices/route');
app.use('/api/vault',            vaultRoutes);
app.use('/api/pos',              posRoutes);
app.use('/api/invoice-registry', invoiceRoutes);


app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'VMS School ERP API is running',
    timestamp: new Date(),
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// ═══════════════════════════════════════════════════════════
//  ERROR HANDLING (must be last)
// ═══════════════════════════════════════════════════════════
app.use(notFound);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════
//  DATABASE + SERVER
// ═══════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`🚀 VMS School ERP API running on port ${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ─── Graceful shutdown ──────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

module.exports = app;
