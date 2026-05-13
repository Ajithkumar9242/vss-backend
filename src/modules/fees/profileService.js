'use strict';

const mongoose          = require('mongoose');
const StudentFeeProfile = require('../../models/StudentFeeProfile');
const FeeComponent      = require('../../models/FeeComponent');
const FeeInvoice        = require('../../models/FeeInvoice');
const Student           = require('../../models/Student');
const AcademicYear      = require('../../models/AcademicYear');
const AppError          = require('../../utils/AppError');
const ActivityService   = require('../activity/service');
const NotificationService = require('../notification/service');

/**
 * StudentFeeProfileService — manages student fee assignments.
 * SOURCE OF TRUTH for: components, installments, discounts, penaltyConfig.
 */
class StudentFeeProfileService {

  // ─── Academic Year Resolution ─────────────────────────────
  static async _resolveYear(academicYearId) {
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      return new mongoose.Types.ObjectId(academicYearId);
    }
    // Fall back to active academic year
    const activeYear = await AcademicYear.findOne({ isActive: true }).lean();
    return activeYear?._id || null;
  }

  static async findProfile(studentId, academicYearId) {
    const query = { studentId };
    if (academicYearId) query.academicYearId = academicYearId;
    return StudentFeeProfile.findOne(query).sort({ createdAt: -1 });
  }

  static async findInvoice(studentId, academicYearId) {
    const query = { studentId };
    if (academicYearId) query.academicYearId = academicYearId;
    return FeeInvoice.findOne(query).sort({ createdAt: -1 });
  }

  // ═══════════════════════════════════════════════════════════
  //  CLASS MATRIX (for Assign Fees page)
  // ═══════════════════════════════════════════════════════════

  static async getClassMatrix(classId, academicYearId) {
    if (!classId) throw new AppError('classId is required', 400);

    const resolvedYearId = await StudentFeeProfileService._resolveYear(academicYearId);

    // All active students in class
    const students = await Student.find({ classId, isActive: true })
      .select('_id name rollNo parentName parentPhone admissionId sectionId')
      .populate('admissionId', 'applicationNo')
      .sort({ name: 1 })
      .lean();

    if (!students.length) return { students: [], components: [], profiles: [] };

    // All active fee components
    const components = await FeeComponent.find({ active: true })
      .sort({ mandatory: -1, name: 1 })
      .lean();

    // Existing profiles for these students
    const studentIds = students.map(s => s._id);
    const profileQuery = { studentId: { $in: studentIds } };
    if (resolvedYearId) profileQuery.academicYearId = resolvedYearId;

    const profiles = await StudentFeeProfile.find(profileQuery)
      .populate('selectedComponents.componentId', 'name code amount mandatory')
      .lean();

    const profileMap = {};
    for (const p of profiles) profileMap[p.studentId.toString()] = p;

    // Load linked invoices
    const invoices = await FeeInvoice.find({ studentId: { $in: studentIds } }).lean();
    const invoiceMap = {};
    for (const inv of invoices) invoiceMap[inv.studentId.toString()] = inv;

    // Build matrix rows
    const rows = students.map(student => {
      const profile = profileMap[student._id.toString()] || null;
      const invoice = invoiceMap[student._id.toString()] || null;

      const selectedIds = new Set(
        (profile?.selectedComponents || []).map(c =>
          String(c.componentId?._id || c.componentId)
        )
      );

      const componentChecks = {};
      for (const comp of components) {
        const cid = String(comp._id);
        componentChecks[cid] = comp.mandatory || selectedIds.has(cid);
      }

      return {
        studentId:         student._id,
        name:              student.name,
        rollNo:            student.rollNo,
        sectionId:         student.sectionId || null,
        admissionNo:       student.admissionId?.applicationNo || student.rollNo,
        parentName:        student.parentName,
        profileId:         profile?._id || null,
        locked:            profile?.locked || false,
        discounts:         profile?.discounts || [],
        grossFee:          profile?.grossFee || 0,
        discountAmt:       profile?.discountAmt || 0,
        netFee:            profile?.netFee || 0,
        installments:      profile?.installments || [],
        scheduleOutOfSync: profile?.scheduleOutOfSync || false,
        penaltyConfig:     profile?.penaltyConfig || { enabled: false, type: 'fixed', value: 0, frequency: 'monthly' },
        notes:             profile?.notes || '',
        componentChecks,
        invoiceId:         invoice?._id || null,
        invoiceStatus:     invoice?.status || null,
        invoiceNumber:     invoice?.invoiceNumber || null,
      };
    });

    return { students: rows, components, profiles };
  }

  // ═══════════════════════════════════════════════════════════
  //  BULK SAVE (core save from Assign Fees page)
  // ═══════════════════════════════════════════════════════════

  static async bulkSave({ classId, academicYearId, rows, userId }) {
    if (!classId) throw new AppError('classId is required', 400);
    if (!rows || !rows.length) throw new AppError('No rows to save', 400);

    const resolvedYearId = await StudentFeeProfileService._resolveYear(academicYearId);

    // Load all components once
    const allComponents = await FeeComponent.find({ active: true }).lean();
    const compMap = {};
    for (const c of allComponents) compMap[c._id.toString()] = c;

    const results = { saved: 0, skipped: 0, errors: [], warnings: [] };

    for (const row of rows) {
      try {
        const {
          studentId,
          selectedComponentIds = [],
          discounts = [],
          installments,         // intentionally no default — undefined means "not sent"
          penaltyConfig,
          notes,
        } = row;

        // Skip locked profiles
        const existing = await StudentFeeProfile.findOne({
          studentId,
          academicYearId: resolvedYearId,
        });
        if (existing?.locked) {
          results.skipped++;
          continue;
        }

        // Always include mandatory components
        const mandatoryIds = allComponents
          .filter(c => c.mandatory)
          .map(c => c._id.toString());
        const finalIds = [...new Set([...mandatoryIds, ...selectedComponentIds.map(String)])];

        const selectedComponents = finalIds
          .map(id => {
            const comp = compMap[id];
            if (!comp) return null;
            return {
              componentId: comp._id,
              name:        comp.name,
              code:        comp.code,
              amount:      comp.amount,
              mandatory:   comp.mandatory,
            };
          })
          .filter(Boolean);

        // ── Installment guard ──────────────────────────────────────────
        // undefined or []  → not set this session → keep existing schedule
        // [{...}, ...]     → user explicitly set them → use incoming
        const incomingInst = Array.isArray(installments) && installments.length > 0
          ? installments
          : (existing?.installments?.length ? existing.installments : []);

        // Warn (non-blocking) when installments have no due date
        const missingDue = incomingInst.filter(i => !i.dueDate);
        if (missingDue.length > 0) {
          results.warnings.push({
            studentId,
            warning: `${missingDue.length} installment(s) missing due date — use the Sch. button to set them.`,
          });
        }

        if (existing) {
          // ── Update via .save() so the pre-save hook fires ──────────────
          // pre-save recomputes grossFee / discountAmt / netFee
          // and throws if installment sum !== netFee (±1 rounding)
          existing.selectedComponents = selectedComponents;
          // Only replace discounts if caller sent new ones; otherwise preserve
          if (Array.isArray(discounts) && discounts.length > 0) {
            existing.discounts = discounts;
          }
          existing.installments  = incomingInst;
          existing.penaltyConfig = penaltyConfig ?? existing.penaltyConfig ?? {
            enabled: false, type: 'fixed', value: 0, frequency: 'monthly',
          };
          if (notes !== undefined) existing.notes = notes;
          existing.classId        = classId;
          existing.academicYearId = resolvedYearId;
          existing.updatedBy      = userId;
          await existing.save();  // triggers pre-save hook
          await StudentFeeProfileService._upsertInvoice(existing, resolvedYearId, userId);
        } else {
          // ── Create ─────────────────────────────────────────────────────
          const profile = await StudentFeeProfile.create({
            studentId,
            classId,
            academicYearId:  resolvedYearId,
            selectedComponents,
            discounts:       discounts || [],
            installments:    incomingInst,
            penaltyConfig:   penaltyConfig || {
              enabled: false, type: 'fixed', value: 0, frequency: 'monthly',
            },
            notes:     notes || '',
            createdBy: userId,
            updatedBy: userId,
          });
          await StudentFeeProfileService._upsertInvoice(profile, resolvedYearId, userId);
        }

        results.saved++;
      } catch (err) {
        // Per-row error (installment sum mismatch, validation) — other rows still save
        results.errors.push({ studentId: row.studentId, error: err.message });
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  //  SINGLE STUDENT PROFILE
  // ═══════════════════════════════════════════════════════════

  static async getStudentProfile(studentId, academicYearId) {
    const query = { studentId };
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      query.academicYearId = academicYearId;
    }
    return StudentFeeProfile.findOne(query)
      .populate('studentId', 'name rollNo classId parentName parentPhone')
      .populate('classId', 'name code')
      .populate('academicYearId', 'name')
      .populate('selectedComponents.componentId', 'name code amount mandatory recurringType')
      .populate('discounts.approvedBy', 'name')
      .populate('lockedBy', 'name')
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  //  DISCOUNT
  // ═══════════════════════════════════════════════════════════

  static async addDiscount(studentId, academicYearId, discountData, userId) {
    const profile = await StudentFeeProfileService.findProfile(studentId, academicYearId);
    if (!profile) throw new AppError('Student fee profile not found', 404);
    if (profile.locked) throw new AppError('Profile is locked. Unlock first.', 403);

    profile.discounts.push({ ...discountData, approvedBy: userId, appliedAt: new Date() });
    await profile.save(); // pre-save recomputes netFee and sets scheduleOutOfSync if needed

    // Sync discount to linked invoice (if schedule is still valid)
    const invoice = await StudentFeeProfileService.findInvoice(studentId, profile.academicYearId);
    if (invoice && !invoice.locked) {
      invoice.discountAmount = profile.discountAmt;
      // Do not update netFee/dueAmount on invoice if schedule is now out of sync —
      // admin must regenerate schedule first. Only sync discountAmount for display.
      await invoice.save();
    }

    // Return both profile and sync status so caller/frontend can warn the admin
    return {
      profile,
      scheduleOutOfSync: profile.scheduleOutOfSync || false,
      netFee:            profile.netFee,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  LOCKING
  // ═══════════════════════════════════════════════════════════

  static async lockProfile(studentId, academicYearId, userId) {
    const profile = await StudentFeeProfileService.findProfile(studentId, academicYearId);
    if (!profile) throw new AppError('Profile not found', 404);
    if (profile.locked) throw new AppError('Profile is already locked', 400);

    profile.locked   = true;
    profile.lockedAt = new Date();
    profile.lockedBy = userId;
    await profile.save();

    // Also lock the linked invoice
    const invoice = await StudentFeeProfileService.findInvoice(studentId, profile.academicYearId);
    if (invoice && !invoice.locked) {
      invoice.locked   = true;
      invoice.lockedAt = new Date();
      invoice.lockedBy = userId;
      await invoice.save();
    }

    return profile;
  }

  static async unlockProfile(studentId, academicYearId, userId) {
    const profile = await StudentFeeProfileService.findProfile(studentId, academicYearId);
    if (!profile) throw new AppError('Profile not found', 404);
    if (!profile.locked) throw new AppError('Profile is not locked', 400);

    profile.locked     = false;
    profile.unlockedAt = new Date();
    profile.unlockedBy = userId;
    await profile.save();

    const invoice = await StudentFeeProfileService.findInvoice(studentId, profile.academicYearId);
    if (invoice && invoice.locked) {
      invoice.locked     = false;
      invoice.unlockedAt = new Date();
      invoice.unlockedBy = userId;
      await invoice.save();
    }

    return profile;
  }

  // ═══════════════════════════════════════════════════════════
  //  INVOICE UPSERT (called after bulk-save)
  // ═══════════════════════════════════════════════════════════

  static async _upsertInvoice(profile, academicYearId, userId) {
    try {
      const FeesService = require('./service');
      const existingInvoice = await FeeInvoice.findOne({
        studentId:      profile.studentId,
        academicYearId,
      });

      // ── Schedule readiness check ────────────────────────────────────────────
      // Only auto-upsert an invoice when the schedule is complete and in-sync.
      // Missing schedule / out-of-sync → skip silently (admin must do it manually).
      const hasSchedule    = profile.installments && profile.installments.length > 0;
      const allHaveDueDate = hasSchedule && profile.installments.every(i => i.dueDate);
      const inSync         = !profile.scheduleOutOfSync;

      if (existingInvoice) {
        if (!existingInvoice.locked) {
          // Sync amounts
          existingInvoice.grossFee       = profile.grossFee;
          existingInvoice.discountAmount = profile.discountAmt;
          existingInvoice.netFee         = profile.netFee;
          existingInvoice.feeProfileId   = profile._id;
          existingInvoice.penaltyConfig  = profile.penaltyConfig;
          await existingInvoice.save();

          // Only regenerate schedule if profile schedule is complete & in-sync
          if (hasSchedule && allHaveDueDate && inSync) {
            await FeesService.regenerateSchedule(existingInvoice._id.toString(), userId);
          }
        }
      } else {
        // Only auto-generate invoice if profile has a complete, in-sync schedule
        if (hasSchedule && allHaveDueDate && inSync) {
          const student = await Student.findById(profile.studentId).select('classId').lean();
          await FeesService.generateInvoice({
            studentId:      profile.studentId,
            classId:        student?.classId || profile.classId,
            academicYearId,
          });
        }
        // else: admin must click "+ Invoice" manually after setting the schedule
      }
    } catch (e) {
      console.error('[ProfileService] Invoice upsert error (non-blocking):', e.message);
    }
  }
}

module.exports = StudentFeeProfileService;
