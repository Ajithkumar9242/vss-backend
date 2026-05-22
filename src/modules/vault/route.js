'use strict';

const router = require('express').Router();
const multer = require('multer');
const { protect, authorize } = require('../../middlewares/auth');
const VaultController = require('./controller');

const ADMIN_ROLES = ['admin', 'super_admin', 'principal', 'accountant', 'visitor'];
const ADMIN_WRITE_ROLES = ['admin', 'super_admin', 'principal', 'accountant'];
const PARENT_ROLES = ['parent'];
const ALL_ROLES = [...ADMIN_ROLES, ...PARENT_ROLES];


// Multer: memory storage for Cloudinary upload (10 MB limit for vault)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, WebP, PDF, DOC, and DOCX files are allowed'), false);
    },
});

router.use(protect);

// ─── Catalog (parent sees active only; controller handles filtering) ──
router.get('/catalog', authorize(...ALL_ROLES), VaultController.listCatalog);
router.post('/catalog', authorize(...ADMIN_WRITE_ROLES), VaultController.createCatalogItem);
router.put('/catalog/:id', authorize(...ADMIN_WRITE_ROLES), VaultController.updateCatalogItem);
router.patch('/catalog/:id/toggle', authorize(...ADMIN_WRITE_ROLES), VaultController.toggleCatalogItem);

// ─── Requests — Admin ────────────────────────────────────────────────
router.get('/requests', authorize(...ADMIN_ROLES), VaultController.listRequests);
router.post('/requests/:id/approve', authorize(...ADMIN_WRITE_ROLES), VaultController.approveRequest);
router.post('/requests/:id/reject', authorize(...ADMIN_WRITE_ROLES), VaultController.rejectRequest);
router.patch('/requests/:id/fulfill', authorize(...ADMIN_WRITE_ROLES), VaultController.fulfillRequest);
// SuperAdmin ONLY cash override
router.post('/requests/:id/pay/admin-mark-paid', authorize('super_admin'), VaultController.adminMarkPaid);

// ─── Files — Admin ───────────────────────────────────────────────────
router.post('/students/:studentId/files/upload', authorize(...ADMIN_WRITE_ROLES), upload.single('file'), VaultController.uploadFile);
router.get('/students/:studentId/files', authorize(...ADMIN_ROLES), VaultController.listStudentFiles);
router.delete('/files/:fileId', authorize(...ADMIN_WRITE_ROLES), VaultController.softDeleteFile);

// ─── Receipt PDF — Admin + Parent ────────────────────────────────────
router.get('/requests/:id/receipt', authorize(...ALL_ROLES), VaultController.getRequestReceipt);

// ─── Requests — Parent ───────────────────────────────────────────────
// Note: /requests/my must be BEFORE /requests/:id routes
router.get('/requests/my', authorize(...PARENT_ROLES), VaultController.listMyRequests);
router.post('/requests', authorize(...PARENT_ROLES), VaultController.createRequest);
router.post('/requests/:id/pay/razorpay', authorize(...PARENT_ROLES), VaultController.createRazorpayOrder);
router.post('/requests/:id/pay/confirm', authorize(...PARENT_ROLES), VaultController.confirmPayment);

// ─── Files — Parent ──────────────────────────────────────────────────
router.get('/files/my', authorize(...PARENT_ROLES), VaultController.listMyFiles);

// ─── Download — Admin + Parent (controller enforces parent guard) ─────
router.get('/files/:fileId/download', authorize(...ALL_ROLES), VaultController.downloadFile);

module.exports = router;
