const AppError = require('./AppError');
const axios = require('axios');
/**
 * File Upload Utility.
 * Uses Cloudinary when CLOUDINARY_URL is configured.
 * Falls back to a mock response when no credentials are set.
 *
 * Validates: file type (image/pdf/doc/docx) and size (max 5MB).
 */

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const safeFileBase = (name = 'file') => (
  name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 120) || 'file'
);

const verifyPdfUrl = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { Range: 'bytes=0-4' },
    validateStatus: (status) => status >= 200 && status < 300,
    maxRedirects: 5,
  });

  const signature = Buffer.from(response.data).slice(0, 5).toString('utf8');
  if (signature !== '%PDF-') {
    throw new AppError('Uploaded file is not a valid PDF', 400);
  }
};

/**
 * Upload a single file to Cloudinary.
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, size: number }} file
 * @param {string} [folder='vms-erp'] - Cloudinary folder path
 * @returns {{ url: string, publicId: string }}
 */
const uploadToCloudinary = async (file, folder = 'vms-erp') => {
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new AppError(
      `File type not allowed. Allowed: images, PDF, DOC, DOCX`,
      400
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    throw new AppError('File too large. Maximum size is 5MB', 400);
  }

  // ─── Check if Cloudinary is configured ──────────────────────
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const cloudinary = require('cloudinary').v2;

      // Configure if not done via CLOUDINARY_URL
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });
      }

      const result = await new Promise((resolve, reject) => {
        const isImage = file.mimetype.startsWith('image/');
        const isPdf = file.mimetype === 'application/pdf';

        const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
        const safeName = `${safeFileBase(file.originalname)}_${Date.now()}`;
        const publicId = isImage ? safeName : `${safeName}.${isPdf ? 'pdf' : (ext || 'bin')}`;

        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: isImage ? 'image' : 'raw',
            public_id: publicId,
            ...(isPdf ? { format: 'pdf', content_type: 'application/pdf' } : {}),
            use_filename: false,
            unique_filename: false,
            overwrite: false,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        stream.end(file.buffer);
      });

      if (file.mimetype === 'application/pdf') {
        try {
          await verifyPdfUrl(result.secure_url);
        } catch (verifyError) {
          await cloudinary.uploader.destroy(result.public_id, { resource_type: 'raw' }).catch(() => {});
          throw verifyError;
        }
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        originalName: file.originalname,   // preserve real filename
        resourceType: result.resource_type,
      };
    } catch (error) {
      console.error('⚠️ Cloudinary upload failed:', error.message);
      if (error instanceof AppError) throw error;
      throw new AppError('File upload failed. Please try again.', 500);
    }
  }

  // ─── Fallback: mock response (no Cloudinary configured) ────
  console.warn('⚠️ Cloudinary not configured — returning mock upload URL');
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    url: `https://via.placeholder.com/200?text=${encodeURIComponent(file.originalname)}`,
    publicId: mockId,
    originalName: file.originalname,
  };
};

/**
 * Upload multiple files to Cloudinary.
 * @param {Array<{buffer, mimetype, originalname, size}>} files
 * @param {string} [folder='vms-erp'] - Cloudinary folder path
 * @returns {Array<{ url, publicId, name, type, size }>}
 */
const uploadMultipleToCloudinary = async (files, folder = 'vms-erp') => {
  const results = await Promise.all(
    files.map(async (file) => {
      const { url, publicId, resourceType } = await uploadToCloudinary(file, folder);
      return {
        url,
        publicId,
        resourceType,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
      };
    })
  );
  return results;
};

module.exports = { uploadToCloudinary, uploadMultipleToCloudinary, ALLOWED_TYPES, MAX_SIZE };
