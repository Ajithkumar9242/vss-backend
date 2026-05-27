const Admission = require('../../models/Admission');
const Student = require('../../models/Student');
const Class = require('../../models/Class');
const Parent = require('../../models/Parent');
const AppError = require('../../utils/AppError');
const NotificationService = require('../notification/service');
const ActivityService = require('../activity/service');
const AuthService = require('../auth/service');

/**
 * Admission Service — business logic for admission management.
 * Handles application creation, listing, and approval with student creation.
 */
class AdmissionService {
  /**
   * Generate a unique application number.
   * Format: APP-YYYY-XXXXX (e.g., APP-2026-00001)
   * @returns {string}
   */
  static async generateApplicationNo() {
    const year = new Date().getFullYear();
    const prefix = `APP-${year}-`;

    // Find the latest application in this year
    const latest = await Admission.findOne({ applicationNo: { $regex: `^${prefix}` } })
      .sort({ applicationNo: -1 })
      .select('applicationNo');

    let nextNum = 1;
    if (latest) {
      const lastNum = parseInt(latest.applicationNo.split('-')[2]);
      nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  /**
   * Generate a unique roll number for a student.
   * Format: YYYY-CLSCODE-XXXXX (e.g., 2026-CLS5-00001)
   * @param {string} classId
   * @returns {string}
   */
  static async generateRollNo(classId) {
    const year = new Date().getFullYear();
    const classDoc = await Class.findById(classId);
    const classCode = classDoc ? classDoc.code : 'GEN';
    const prefix = `${year}-${classCode}-`;

    const latest = await Student.findOne({ rollNo: { $regex: `^${prefix}` } })
      .sort({ rollNo: -1 })
      .select('rollNo');

    let nextNum = 1;
    if (latest) {
      const lastNum = parseInt(latest.rollNo.split('-')[2]);
      nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  /**
   * Create a new admission application (offline mode — admin-created).
   * @param {Object} data - admission form data
   * @returns {Object} created admission
   */
  static async createAdmission(data) {
    // Verify class exists
    const classDoc = await Class.findById(data.classId);
    if (!classDoc) {
      throw new AppError('Class not found', 404);
    }

    // Auto-resolve academic year (fallback to active if not provided)
    const SetupService = require('../setup/service');
    data.academicYearId = await SetupService.resolveAcademicYearId(data.academicYearId);

    // Validate class is configured for this academic year (graceful — skips if not set up)
    await SetupService.validateClassForYear(data.classId, data.academicYearId);

    // Validate section belongs to the specified class (if section is provided)
    if (data.sectionId) {
      const Section = require('../../models/Section');
      const section = await Section.findById(data.sectionId);
      if (!section) throw new AppError('Section not found', 404);
      if (section.classId.toString() !== data.classId.toString()) {
        throw new AppError('Section does not belong to the selected class', 400);
      }
    }

    // Auto-generate application number
    data.applicationNo = await AdmissionService.generateApplicationNo();

    const admission = await Admission.create(data);

    // Activity log for admission creation (non-blocking)
    ActivityService.log({
      action: `Admission application created for ${data.studentName}`,
      module: 'admission',
      metadata: { applicationNo: data.applicationNo, studentName: data.studentName },
    }).catch((e) => console.error('Activity log failed:', e.message));

    // Return with populated references
    return Admission.findById(admission._id)
      .populate('classId', 'name code')
      .populate('sectionId', 'name');
  }

  /**
   * Get all admissions with filters and pagination.
   * @param {Object} query - { status, classId, mode, page, limit }
   * @returns {{ admissions: Array, total: number, page: number, limit: number }}
   */
  static async getAdmissions(query = {}) {
    const filter = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.classId) {
      filter.classId = query.classId;
    }
    if (query.mode) {
      filter.mode = query.mode;
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [admissions, total] = await Promise.all([
      Admission.find(filter)
        .populate('classId', 'name code')
        .populate('sectionId', 'name')
        .populate('approvedBy', 'name email')
        .populate('studentId', 'rollNo name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Admission.countDocuments(filter),
    ]);

    return { admissions, total, page, limit };
  }

  /**
   * Get a single admission by ID.
   * @param {string} admissionId
   * @returns {Object} admission document
   */
  static async getAdmissionById(admissionId) {
    const admission = await Admission.findById(admissionId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('approvedBy', 'name email')
      .populate('studentId', 'rollNo name');

    if (!admission) {
      throw new AppError('Admission not found', 404);
    }

    return admission;
  }

  /**
   * Get admission by application number (public — for status tracking).
   * @param {string} applicationNo
   * @returns {Object} admission document (limited fields)
   */
  static async getAdmissionByApplicationNo(applicationNo) {
    const admission = await Admission.findOne({ applicationNo })
      .populate('classId', 'name code')
      .select('applicationNo studentName classId status paymentStatus mode type remarks createdAt approvedAt');

    if (!admission) {
      throw new AppError('Application not found. Please check the application number.', 404);
    }

    return admission;
  }

  /**
   * Search admissions by phone number (public — for status tracking).
   * @param {string} phone
   * @returns {Array} matching admissions (limited fields)
   */
  static async searchAdmissionsByPhone(phone) {
    if (!phone || phone.trim().length < 10) {
      throw new AppError('Please enter a valid phone number', 400);
    }

    const admissions = await Admission.find({ parentPhone: phone.trim() })
      .populate('classId', 'name code')
      .select('applicationNo studentName classId status paymentStatus mode type remarks createdAt approvedAt')
      .sort({ createdAt: -1 })
      .limit(10);

    return admissions;
  }

  /**
   * Approve an admission — creates a Student record and links it.
   * CRITICAL: Prevents double-approval.
   *
   * @param {string} admissionId
   * @param {string} approvedByUserId - the admin/user approving
   * @returns {{ admission: Object, student: Object }}
   */
  static async approveAdmission(admissionId, approvedByUserId) {
    // 1. Find the admission
    const admission = await Admission.findById(admissionId);
    if (!admission) {
      throw new AppError('Admission not found', 404);
    }

    // 2. Prevent double-approval
    if (admission.status === 'approved') {
      throw new AppError('This admission has already been approved', 400);
    }

    // 3. Prevent approving a rejected admission
    if (admission.status === 'rejected') {
      throw new AppError('Cannot approve a rejected admission', 400);
    }

    // 4. Generate roll number for the new student
    const rollNo = admission.rollNo || await AdmissionService.generateRollNo(admission.classId);

    // 4a. Resolve academic year from admission (fallback to active)
    const SetupService = require('../setup/service');
    const resolvedAcademicYearId = admission.academicYearId
      || (await SetupService.resolveAcademicYearId(null));

    // 4b. Generate admission number atomically (only consumed on successful approval)
    let admissionNumber = admission.admissionNo;
    if (!admissionNumber) {
      try {
        const CounterService = require('../../utils/counterService');
        const yearLabel = CounterService.getAcademicYearLabel();
        const result = await CounterService.getNext('admissionNumber', { yearLabel, padLength: 3, startFrom: 1 });
        admissionNumber = result.formatted; // e.g. "001/2026-27"
      } catch (e) {
        console.error('Admission number generation failed (non-critical):', e.message);
      }
    }



    // 5. Create Student from admission data
    const student = await Student.create({
      admissionId: admission._id,
      admissionNumber,
      admissionNo: admissionNumber,
      registerNo: rollNo,
      rollNo,
      name: admission.studentName,
      dateOfBirth: admission.dateOfBirth,
      gender: admission.gender,
      classId: admission.classId,
      sectionId: admission.sectionId,
      academicYearId: resolvedAcademicYearId,
      parentName: admission.parentName,
      parentPhone: admission.parentPhone,
      parentEmail: admission.parentEmail,
      address: admission.address,
    });


    // 5a. Auto-generate fee invoice for the new student (non-blocking)
    try {
      const FeesService = require('../fees/service');
      await FeesService.generateInvoice({
        studentId: student._id,
        classId: student.classId,
        academicYearId: resolvedAcademicYearId,
      });
    } catch (e) {
      console.error('Auto invoice generation failed (non-critical):', e.message);
    }

    // 6. Auto-create or reuse Parent + link student + create User
    let parentDoc = null;
    try {
      // Try to find existing parent by phone or email
      const parentQuery = [];
      if (admission.parentPhone) parentQuery.push({ phone: admission.parentPhone });
      if (admission.parentEmail) parentQuery.push({ email: admission.parentEmail });

      if (parentQuery.length > 0) {
        parentDoc = await Parent.findOne({ $or: parentQuery });
      }

      if (!parentDoc) {
        // Create new parent
        parentDoc = await Parent.create({
          name: admission.parentName,
          phone: admission.parentPhone,
          email: admission.parentEmail || null,
          address: admission.address,
          linkedStudents: [student._id],
        });
      } else {
        // Add student to existing parent's linkedStudents (avoid duplicates)
        if (!parentDoc.linkedStudents.some((id) => id.toString() === student._id.toString())) {
          parentDoc.linkedStudents.push(student._id);
          await parentDoc.save();
        }
      }

      // Link parent to student ONLY ONCE
      if (!student.parentId) {
        student.parentId = parentDoc._id;
        await student.save();
      }

      // Auto-create user account for parent (non-blocking)
      AuthService.createParentUser(parentDoc).catch((e) =>
        console.error('Parent user creation failed:', e.message)
      );
    } catch (e) {
      console.error('Parent auto-create failed:', e.message);
    }

    // 7. Update admission status and link student
    admission.status = 'approved';
    admission.approvedBy = approvedByUserId;
    admission.approvedAt = new Date();
    admission.studentId = student._id;
    await admission.save();

    // Trigger notification + activity (non-blocking)
    AdmissionService._triggerApprovalEvents(admission, student, approvedByUserId, parentDoc);

    // 8. Return populated data
    const updatedAdmission = await Admission.findById(admissionId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('approvedBy', 'name email')
      .populate('studentId', 'rollNo name');

    const populatedStudent = await Student.findById(student._id)
      .populate('classId', 'name code')
      .populate('sectionId', 'name');

    return { admission: updatedAdmission, student: populatedStudent };
  }

  /**
   * Fire notification + activity for approved admission (non-blocking).
   */
  static _triggerApprovalEvents(admission, student, approvedByUserId, parentDoc) {
    // Fire-and-forget — don't block response
    // Notify the parent user if available, otherwise the approver
    const notifyUserId = parentDoc?.userId || approvedByUserId;
    NotificationService.create(notifyUserId, {
      title: 'Admission Approved',
      message: `${admission.studentName} (${admission.applicationNo}) has been approved.`,
      type: 'success',
      metadata: { admissionId: admission._id, studentId: student._id },
    }).catch((e) => console.error('Notification trigger failed:', e.message));

    // Send Email to Parent (guarded — emailService may not be configured)
    try {
      const EmailService = require('../../utils/emailService');
      if (typeof EmailService.sendAdmissionApprovedEmail === 'function') {
        EmailService.sendAdmissionApprovedEmail(admission, student).catch((e) =>
          console.error('Email notification failed:', e.message)
        );
      }
    } catch (e) {
      console.error('EmailService unavailable:', e.message);
    }

    // Fallback SMS
    if (admission.parentPhone) {
      NotificationService.sendSMS(
        admission.parentPhone,
        `Congratulations! The admission for ${admission.studentName} has been approved. Roll No: ${student.rollNo}`,
        'ADMISSION_APPROVED',
        { studentName: admission.studentName, rollNo: student.rollNo }
      ).catch((e) => console.error('SMS fallback failed:', e.message));
    }

    ActivityService.log({
      studentId: student._id,
      action: `Admission approved — Roll No: ${student.rollNo}`,
      module: 'admission',
      performedBy: approvedByUserId,
      metadata: { admissionId: admission._id, applicationNo: admission.applicationNo },
    }).catch((e) => console.error('Activity log failed:', e.message));
  }

  /**
   * Reject an admission.
   * @param {string} admissionId
   * @param {string} rejectedByUserId
   * @param {string} remarks - reason for rejection
   * @returns {Object} updated admission
   */
  static async rejectAdmission(admissionId, rejectedByUserId, remarks) {
    const admission = await Admission.findById(admissionId);
    if (!admission) {
      throw new AppError('Admission not found', 404);
    }

    if (admission.status === 'approved') {
      throw new AppError('Cannot reject an already approved admission', 400);
    }

    if (admission.status === 'rejected') {
      throw new AppError('This admission has already been rejected', 400);
    }

    admission.status = 'rejected';
    admission.approvedBy = rejectedByUserId;
    admission.approvedAt = new Date();
    if (remarks) admission.remarks = remarks;
    await admission.save();

    // Fire notification for rejection (non-blocking)
    NotificationService.create(rejectedByUserId, {
      title: 'Admission Rejected',
      message: `${admission.studentName} (${admission.applicationNo}) has been rejected.`,
      type: 'warning',
      metadata: { admissionId: admission._id },
    }).catch((e) => console.error('Notification trigger failed:', e.message));

    return Admission.findById(admissionId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('approvedBy', 'name email');
  }
  /**
   * Put an admission on hold.
   * @param {string} admissionId
   * @param {string} userId
   * @param {string} remarks
   */
  static async holdAdmission(admissionId, userId, remarks) {
    const admission = await Admission.findById(admissionId);
    if (!admission) throw new AppError('Admission not found', 404);
    if (admission.status === 'approved') throw new AppError('Cannot hold an approved admission', 400);

    admission.status     = 'hold';
    admission.approvedBy = userId;
    admission.holdRemarks = remarks || '';
    admission.remarks    = remarks || '';
    await admission.save();

    // Notification (non-blocking)
    const parentUser = admission.parentPhone
      ? await require('../../models/Parent').findOne({ phone: admission.parentPhone }).select('userId').lean()
      : null;
    const notifyId = parentUser?.userId || userId;
    NotificationService.create(notifyId, {
      title:   'Application On Hold',
      message: `${admission.studentName} (${admission.applicationNo}) has been placed on hold.${remarks ? ' Reason: ' + remarks : ''}`,
      type:    'warning',
      metadata: { admissionId: admission._id },
    }).catch(() => {});

    ActivityService.log({
      action: `Admission placed on hold — ${admission.applicationNo}`,
      module: 'admission',
      performedBy: userId,
      metadata: { admissionId: admission._id, remarks },
    }).catch(() => {});

    return Admission.findById(admissionId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('approvedBy', 'name email');
  }

  /**
   * Update an admission application (editable before approval).
   * @param {string} admissionId
   * @param {Object} data - fields to update
   * @param {string} userId - who is editing
   */
  static async updateAdmission(admissionId, data, user) {
    const userId = user._id || user.id;
    const role = (user.role || '').toLowerCase();
    const isSuperAdmin = role === 'super_admin';

    const admission = await Admission.findById(admissionId);
    if (!admission) throw new AppError('Admission not found', 404);
    if (admission.status === 'approved' && !isSuperAdmin) {
      throw new AppError('Approved admissions cannot be edited directly', 400);
    }

    // Capture a lightweight change summary for audit
    const changedFields = Object.keys(data).filter(k => String(data[k]) !== String(admission[k]));

    const oldAdmission = await Admission.findById(admissionId).select('parentPhone').lean();

    // Merge and save — pre-save hook will CAPS names automatically
    Object.assign(admission, data);
    admission.editHistory.push({ editedBy: userId, editedAt: new Date(), changes: { fields: changedFields } });
    await admission.save();

    if (oldAdmission && data.parentPhone && oldAdmission.parentPhone !== data.parentPhone) {
      const { syncPhoneNumbers } = require('../../utils/phoneSync');
      syncPhoneNumbers({
        admissionId,
        newPhone: data.parentPhone,
        oldPhone: oldAdmission.parentPhone
      }).catch(err => console.error('[AdmissionUpdate PhoneSync Error]:', err));
    }

    ActivityService.log({
      action: `Admission updated — ${admission.applicationNo}`,
      module: 'admission',
      performedBy: userId,
      metadata: { admissionId: admission._id, changedFields },
    }).catch(() => {});

    return Admission.findById(admissionId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name');
  }

  /**
   * Get admission open/close settings from SchoolSetting singleton.
   */
  static async getAdmissionSettings() {
    const SchoolSetting = require('../../models/SchoolSetting');
    const setting = await SchoolSetting.findOne()
      .populate('activeAdmissionAcademicYearId', 'name startDate endDate')
      .lean();
    return {
      admissionsOpen:                   setting?.admissionsOpen ?? false,
      activeAdmissionAcademicYearId:    setting?.activeAdmissionAcademicYearId ?? null,
    };
  }

  /**
   * Update admission open/close settings.
   * @param {{ admissionsOpen, activeAdmissionAcademicYearId }} data
   */
  static async updateAdmissionSettings(data) {
    const SchoolSetting = require('../../models/SchoolSetting');
    const setting = await SchoolSetting.findOne();
    if (!setting) throw new AppError('School settings not configured', 404);

    if (typeof data.admissionsOpen === 'boolean') setting.admissionsOpen = data.admissionsOpen;
    if (data.activeAdmissionAcademicYearId !== undefined) {
      setting.activeAdmissionAcademicYearId = data.activeAdmissionAcademicYearId || null;
    }
    await setting.save();

    return {
      admissionsOpen:                setting.admissionsOpen,
      activeAdmissionAcademicYearId: setting.activeAdmissionAcademicYearId,
    };
  }

  /**
   * Submit a public admission application (online form).
   * Validates admissions are open before accepting.
   */
  static async submitPublicAdmission(data) {
    // Check if admissions are open
    const settings = await AdmissionService.getAdmissionSettings();
    if (!settings.admissionsOpen) {
      throw new AppError('Admissions are currently closed. Please check back later.', 403);
    }

    // Force mode to online
    data.mode = 'online';

    // Use the active admission academic year
    if (settings.activeAdmissionAcademicYearId) {
      data.academicYearId = settings.activeAdmissionAcademicYearId._id
        || settings.activeAdmissionAcademicYearId;
    }

    return AdmissionService.createAdmission(data);
  }
}

module.exports = AdmissionService;
