'use strict';

const AppError = require('./AppError');
const Parent = require('../models/Parent');

/**
 * vaultGuard — parent RBAC for the Student Vault module.
 *
 * Rules:
 *  - Admin/super_admin/principal roles always pass (no student-link check needed).
 *  - Parent role: must have the studentId in their linkedStudents array.
 *  - Any other role: 403.
 */

const ADMIN_ROLES = ['super_admin', 'admin', 'principal'];

/**
 * Resolve and validate that req.user (parent) is linked to the given studentId.
 * For admin roles, skips the check and returns studentId as-is.
 *
 * @param {Request} req - Express request with req.user populated by protect middleware.
 * @param {string|ObjectId} studentId - The student ID to validate.
 * @returns {string} Validated studentId string.
 * @throws {AppError} 403 if the parent is not linked to the student.
 */
async function resolveStudentForParent(req, studentId) {
  if (!studentId) throw new AppError('studentId is required', 400);
  if (!req.user)  throw new AppError('Not authenticated', 401);

  // Admins bypass the linkage check
  if (ADMIN_ROLES.includes(req.user.role)) {
    return studentId.toString();
  }

  if (req.user.role !== 'parent') {
    throw new AppError('Access denied', 403);
  }

  // Find parent record linked to this user
  const parent = await Parent.findOne({ userId: req.user._id }).lean();
  if (!parent) throw new AppError('Parent record not found', 403);

  const linked = (parent.linkedStudents || []).map((id) => id.toString());
  if (!linked.includes(studentId.toString())) {
    throw new AppError('Access denied: student not linked to your account', 403);
  }

  return studentId.toString();
}

/**
 * Validate that a parent is allowed to download a VaultFile.
 * - Admin: always allowed.
 * - Parent:
 *   (1) Must be linked to file.studentId.
 *   (2) file.visibleToParent must be true.
 *   (3) If file.requiresApprovedRequest is true, the linked request must be
 *       fulfilled AND paid.
 *
 * @param {Request} req
 * @param {Object}  vaultFile - Mongoose document or lean object of StudentVaultFile
 * @returns {void} — throws AppError on failure
 */
async function authorizeFileDownload(req, vaultFile) {
  if (!req.user) throw new AppError('Not authenticated', 401);

  // Admins always allowed
  if (ADMIN_ROLES.includes(req.user.role)) return;

  if (req.user.role !== 'parent') throw new AppError('Access denied', 403);

  // (1) Linkage check
  await resolveStudentForParent(req, vaultFile.studentId);

  // (2) Visibility check
  if (!vaultFile.visibleToParent) {
    throw new AppError('This file is not available for download', 403);
  }

  // (3) Approved request check
  if (vaultFile.requiresApprovedRequest) {
    const StudentDocumentRequest = require('../models/StudentDocumentRequest');
    const requestId = vaultFile.approvedRequestId || vaultFile.requestId;
    if (!requestId) throw new AppError('No approved request linked to this file', 403);

    const req_ = await StudentDocumentRequest.findById(requestId).lean();
    if (!req_) throw new AppError('Linked request not found', 403);

    if (req_.requestStatus !== 'fulfilled') {
      throw new AppError('File not yet fulfilled for your request', 403);
    }
    if (req_.paymentStatus !== 'paid') {
      throw new AppError('Payment not confirmed for this request', 403);
    }
  }
}

module.exports = { resolveStudentForParent, authorizeFileDownload, ADMIN_ROLES };
