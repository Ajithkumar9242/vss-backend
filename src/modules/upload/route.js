const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../../middlewares/auth');
const { uploadToCloudinary, uploadMultipleToCloudinary } = require('../../utils/fileUpload');
const ApiResponse = require('../../utils/apiResponse');
const rateLimiter = require('../../middlewares/rateLimiter');

// ─── Folder map (query ?folder=students → vms-erp/students) ─────
const FOLDER_MAP = {
  students:  'vms-erp/students',
  faculty:   'vms-erp/faculty',
  parents:   'vms-erp/parents',
  materials: 'vms-erp/materials',
  logo:      'vms-erp/logo',
};

const resolveFolder = (req) => {
  const key = req.query.folder;
  return (key && FOLDER_MAP[key]) || 'vms-erp';
};

// Multer config — memory storage (for Cloudinary stream)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ═══════════════════════════════════════════════════════════
//  PUBLIC UPLOAD (for online admission — no JWT)
// ═══════════════════════════════════════════════════════════
const publicUploadRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many uploads. Please wait a moment.',
});

/**
 * POST /api/upload/public
 * Upload a single file without authentication (for online admission form).
 * Rate-limited to prevent abuse.
 */
router.post('/public', publicUploadRateLimit, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return ApiResponse.error(res, 'No file provided', 400);
    }
    const folder = resolveFolder(req);
    const result = await uploadToCloudinary(req.file, folder);
    return ApiResponse.created(res, result, 'File uploaded successfully');
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════
//  PROTECTED UPLOAD (requires auth)
// ═══════════════════════════════════════════════════════════
router.use(protect);

/**
 * POST /api/upload
 * Upload a single file. Supports optional ?folder=students|faculty|parents|materials|logo
 * Returns: { url, publicId }
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return ApiResponse.error(res, 'No file provided', 400);
    }
    const folder = resolveFolder(req);
    const result = await uploadToCloudinary(req.file, folder);
    return ApiResponse.created(res, result, 'File uploaded successfully');
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/multiple
 * Upload up to 10 files. Supports optional ?folder=...
 * Returns: [{ url, publicId, name, type, size }]
 */
router.post('/multiple', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return ApiResponse.error(res, 'No files provided', 400);
    }
    const folder = resolveFolder(req);
    const results = await uploadMultipleToCloudinary(req.files, folder);
    return ApiResponse.created(res, results, `${results.length} file(s) uploaded successfully`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
