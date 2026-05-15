const mongoose = require('mongoose');
const AcademicYear = require('../../models/AcademicYear');
const AcademicTerm = require('../../models/AcademicTerm');
const ClassConfig = require('../../models/ClassConfig');
const ClassGroup = require('../../models/ClassGroup');
const SchoolSetting = require('../../models/SchoolSetting');

const GradeConfig = require('../../models/GradeConfig');
const AttendanceConfig = require('../../models/AttendanceConfig');
const PaymentSetting = require('../../models/PaymentSetting');
const AppError = require('../../utils/AppError');

class SetupService {
  // ═══════════════════════════════════════════════════════════
  //  SCHOOL SETTING (singleton)
  // ═══════════════════════════════════════════════════════════

  static async getSchoolSetting() {
    return SchoolSetting.findOne();
  }

  static async upsertSchoolSetting(data) {
    const existing = await SchoolSetting.findOne();
    if (existing) {
      Object.assign(existing, data);
      return existing.save();
    }
    return SchoolSetting.create(data);
  }

  static _defaultMessageTemplates() {
    return {
      admissionApproval: {
        enabled: true,
        body: 'Dear {{parentName}},\nYour child {{studentName}} has been approved for admission to {{className}}.\nRegards,\n{{schoolName}}',
      },
      feeReminder: {
        enabled: true,
        body: 'Dear {{parentName}}, fee amount {{amount}} for {{studentName}} is due on {{dueDate}}.\nRegards,\n{{schoolName}}',
      },
      attendanceAlert: {
        enabled: true,
        body: 'Dear {{parentName}}, attendance alert for {{studentName}} of {{className}}.\nRegards,\n{{schoolName}}',
      },
      examPublished: {
        enabled: true,
        body: 'Dear {{parentName}}, exam results for {{studentName}} of {{className}} are published.\nRegards,\n{{schoolName}}',
      },
    };
  }

  static async getMessageTemplates() {
    const setting = await SchoolSetting.findOne().lean();
    return {
      ...SetupService._defaultMessageTemplates(),
      ...(setting?.messageTemplates || {}),
    };
  }

  static async upsertMessageTemplates(messageTemplates) {
    const existing = await SchoolSetting.findOne();
    const merged = {
      ...SetupService._defaultMessageTemplates(),
      ...(existing?.messageTemplates?.toObject?.() || existing?.messageTemplates || {}),
      ...(messageTemplates || {}),
    };
    if (existing) {
      existing.messageTemplates = merged;
      return existing.save();
    }
    return SchoolSetting.create({ schoolName: 'VMS School ERP', messageTemplates: merged });
  }

  // ═══════════════════════════════════════════════════════════
  //  ACADEMIC YEAR
  // ═══════════════════════════════════════════════════════════

  static async createAcademicYear(data) {
    if (data.isActive) {
      await AcademicYear.updateMany({}, { isActive: false });
    }
    return AcademicYear.create(data);
  }

  static async updateAcademicYear(id, data) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    if (data.isActive) {
      await AcademicYear.updateMany({ _id: { $ne: id } }, { isActive: false });
    }
    const year = await AcademicYear.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!year) throw new AppError('Academic Year not found', 404);
    return year;
  }

  static async getAcademicYears() {
    return AcademicYear.find().sort({ startDate: -1 });
  }

  static async getActiveAcademicYear() {
    // First try isActive flag, then fall back to current date range
    let year = await AcademicYear.findOne({ isActive: true });
    if (!year) {
      const now = new Date();
      year = await AcademicYear.findOne({ startDate: { $lte: now }, endDate: { $gte: now } });
    }
    if (!year) throw new AppError('No active academic year found. Please create one in Setup.', 404);
    return year;
  }

  // Shared helper used by other services
  static async resolveAcademicYearId(academicYearId) {
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) return academicYearId;
    const active = await AcademicYear.findOne({ isActive: true }).select('_id');
    return active ? active._id : null;
  }

  // ═══════════════════════════════════════════════════════════
  //  ACADEMIC TERMS
  // ═══════════════════════════════════════════════════════════

  static async createTerm(data) {
    if (!data.academicYearId) {
      data.academicYearId = await SetupService.resolveAcademicYearId(null);
    }
    return AcademicTerm.create(data);
  }

  static async getTerms(academicYearId) {
    const yearId = await SetupService.resolveAcademicYearId(academicYearId);
    return AcademicTerm.find({ academicYearId: yearId }).sort({ startDate: 1 });
  }

  static async updateTerm(id, data) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    const term = await AcademicTerm.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!term) throw new AppError('Term not found', 404);
    return term;
  }

  static async deleteTerm(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    const term = await AcademicTerm.findByIdAndDelete(id);
    if (!term) throw new AppError('Term not found', 404);
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  //  CLASS CONFIG
  // ═══════════════════════════════════════════════════════════

  static async upsertClassConfig(data) {
    const { academicYearId, classId, sections, subjects } = data;

    // ── Required fields ───────────────────────────────────────
    if (!academicYearId || !mongoose.isValidObjectId(academicYearId)) {
      throw new AppError('academicYearId is required and must be a valid ID', 400);
    }
    if (!classId || !mongoose.isValidObjectId(classId)) {
      throw new AppError('classId is required and must be a valid ID', 400);
    }

    // ── Subjects validation ───────────────────────────────────
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
      throw new AppError('subjects must be a non-empty array', 400);
    }

    // Deduplicate subject IDs
    const uniqueSubjectIds = [...new Set(subjects.map((s) => s.toString()))];
    if (uniqueSubjectIds.length !== subjects.length) {
      throw new AppError('subjects array contains duplicate IDs', 400);
    }

    // Validate all subject IDs are valid ObjectIds
    for (const sid of uniqueSubjectIds) {
      if (!mongoose.isValidObjectId(sid)) {
        throw new AppError(`Invalid subjectId: ${sid}`, 400);
      }
    }

    // Verify all subjects exist (and are active)
    const Subject = require('../../models/Subject');
    const existingSubjects = await Subject.find({ _id: { $in: uniqueSubjectIds } }).select('_id');
    if (existingSubjects.length !== uniqueSubjectIds.length) {
      const foundIds = existingSubjects.map((s) => s._id.toString());
      const missing = uniqueSubjectIds.filter((id) => !foundIds.includes(id));
      throw new AppError(`Subjects not found: ${missing.join(', ')}`, 400);
    }

    // ── Sections validation ───────────────────────────────────
    const sectionList = Array.isArray(sections) ? sections.filter(Boolean) : [];
    const uniqueSectionIds = [...new Set(sectionList.map((s) => s.toString()))];
    for (const sid of uniqueSectionIds) {
      if (!mongoose.isValidObjectId(sid)) {
        throw new AppError(`Invalid sectionId: ${sid}`, 400);
      }
    }

    // Verify all sections exist and belong to the given classId
    const Section = require('../../models/Section');
    const existingSections = await Section.find({
      _id: { $in: uniqueSectionIds },
      classId,
    }).select('_id');
    if (existingSections.length !== uniqueSectionIds.length) {
      throw new AppError('One or more sections do not belong to the specified class', 400);
    }

    // ── Upsert ────────────────────────────────────────────────
    let config = await ClassConfig.findOne({ academicYearId, classId });
    if (config) {
      config.sections      = uniqueSectionIds;
      config.subjects      = uniqueSubjectIds;
      await config.save();
    } else {
      config = await ClassConfig.create({
        academicYearId,
        classId,
        sections:      uniqueSectionIds,
        subjects:      uniqueSubjectIds,
      });
    }

    return ClassConfig.findById(config._id)
      .populate('classId', 'name code')
      .populate('sections', 'name')
      .populate('subjects', 'name code type isOptional');
  }

  static async getClassConfigs(academicYearId) {
    const yearId = await SetupService.resolveAcademicYearId(academicYearId);
    return ClassConfig.find({ academicYearId: yearId })
      .populate('classId', 'name code order')
      .populate('sections', 'name')
      .populate('subjects', 'name code isOptional');
  }

  // Validation helpers used by other services
  static async validateClassForYear(classId, academicYearId) {
    if (!academicYearId) return null;
    const configCount = await ClassConfig.countDocuments({ academicYearId });
    if (configCount === 0) return null;
    const config = await ClassConfig.findOne({ academicYearId, classId });
    if (!config) throw new AppError('This class is not configured for the selected academic year', 400);
    return config;
  }

  static async validateSubjectsForClass(subjectIds, classId, academicYearId) {
    if (!academicYearId || !subjectIds?.length) return;
    const config = await ClassConfig.findOne({ academicYearId, classId });
    if (!config || !config.subjects?.length) return;
    const allowed = config.subjects.map((s) => s.toString());
    const invalid = subjectIds.filter((id) => !allowed.includes(id.toString()));
    if (invalid.length) throw new AppError(`Subjects not assigned to this class: ${invalid.join(', ')}`, 400);
  }


  // ═══════════════════════════════════════════════════════════
  //  CLASS GROUPS
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate that the given teacherId is a Faculty member.
   * Also accepts alias field name 'teacherId' on top of 'classTeacherId'.
   */
  static async _resolveTeacherId(teacherId) {
    if (!teacherId) return null;
    if (!mongoose.isValidObjectId(teacherId)) {
      throw new AppError('Invalid teacherId format', 400);
    }
    const Faculty = require('../../models/Faculty');
    const faculty = await Faculty.findById(teacherId).populate('userId', 'role');
    if (!faculty) throw new AppError('Faculty not found', 404);
    // Verify the linked user has role faculty (or super_admin)
    if (faculty.userId && !['faculty', 'super_admin', 'admin'].includes(faculty.userId.role)) {
      throw new AppError('Assigned teacher must have faculty role', 400);
    }
    return teacherId;
  }

  static async createClassGroup(data) {
    // Accept teacherId as alias for classTeacherId
    const teacherId = data.teacherId || data.classTeacherId || null;
    const resolvedTeacherId = await SetupService._resolveTeacherId(teacherId);

    return ClassGroup.create({
      name:           data.name,
      classId:        data.classId,
      sectionId:      data.sectionId,
      classTeacherId: resolvedTeacherId,
    });
  }

  static async getClassGroups(filters = {}) {
    const query = {};
    if (filters.classId && mongoose.isValidObjectId(filters.classId)) query.classId = filters.classId;
    const groups = await ClassGroup.find(query)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate({
        path: 'classTeacherId',
        select: 'name email employeeId',
        populate: { path: 'userId', select: 'role' },
      });

    // Normalize response: expose classTeacherId as both classTeacherId and teacherId
    return groups.map((g) => {
      const obj = g.toObject();
      obj.teacherId = obj.classTeacherId;  // alias
      return obj;
    });
  }

  static async updateClassGroup(id, data) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);

    // Accept teacherId as alias for classTeacherId
    const teacherRaw = data.teacherId || data.classTeacherId;
    const resolvedTeacherId = teacherRaw !== undefined
      ? await SetupService._resolveTeacherId(teacherRaw || null)
      : undefined; // undefined = don't touch the field

    const update = {};
    if (data.name      !== undefined) update.name      = data.name;
    if (data.classId   !== undefined) update.classId   = data.classId;
    if (data.sectionId !== undefined) update.sectionId = data.sectionId;
    if (resolvedTeacherId !== undefined) update.classTeacherId = resolvedTeacherId;

    const group = await ClassGroup.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('classTeacherId', 'name email employeeId');
    if (!group) throw new AppError('Class Group not found', 404);

    const obj = group.toObject();
    obj.teacherId = obj.classTeacherId;
    return obj;
  }

  static async deleteClassGroup(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    const group = await ClassGroup.findByIdAndDelete(id);
    if (!group) throw new AppError('Class Group not found', 404);
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  //  GRADE CONFIG
  // ═══════════════════════════════════════════════════════════

  static async createGradeConfig(data) {
    return GradeConfig.create(data);
  }

  static async getGradeConfigs() {
    return GradeConfig.find().sort({ minMarks: 1 });
  }

  static async updateGradeConfig(id, data) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    const grade = await GradeConfig.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!grade) throw new AppError('Grade Config not found', 404);
    return grade;
  }

  static async deleteGradeConfig(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 400);
    const grade = await GradeConfig.findByIdAndDelete(id);
    if (!grade) throw new AppError('Grade Config not found', 404);
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  //  ATTENDANCE CONFIG
  // ═══════════════════════════════════════════════════════════

  // Built-in presets for quick-apply
  static ATTENDANCE_PRESETS = {
    FULL_DAY: [
      { name: 'Morning',   startTime: '09:00', endTime: '12:30', order: 1 },
      { name: 'Afternoon', startTime: '13:30', endTime: '16:00', order: 2 },
    ],
    PERIOD: [
      { name: 'P1', startTime: '09:00', endTime: '09:45', order: 1 },
      { name: 'P2', startTime: '09:45', endTime: '10:30', order: 2 },
      { name: 'P3', startTime: '10:45', endTime: '11:30', order: 3 },
      { name: 'P4', startTime: '11:30', endTime: '12:15', order: 4 },
      { name: 'P5', startTime: '13:15', endTime: '14:00', order: 5 },
      { name: 'P6', startTime: '14:00', endTime: '14:45', order: 6 },
    ],
  };

  /**
   * Upsert attendance config for an academic year.
   * Accepts sessions as objects (new API) or strings (legacy).
   * @param {{ academicYearId, mode, sessions, preset }} data
   */
  static async upsertAttendanceConfig(data) {
    const academicYearId = await SetupService.resolveAcademicYearId(data.academicYearId);
    if (!academicYearId) throw new AppError('No active academic year found', 400);

    const mode = data.mode || 'session';
    let sessions = data.sessions || [];

    // ── Preset shortcut ──────────────────────────────────────
    if (data.preset) {
      const presetSessions = SetupService.ATTENDANCE_PRESETS[data.preset.toUpperCase()];
      if (!presetSessions) {
        throw new AppError(`Unknown preset '${data.preset}'. Valid: FULL_DAY, PERIOD`, 400);
      }
      sessions = presetSessions;
    }

    // ── Normalize legacy string[] to object[] ─────────────────
    sessions = sessions.map((s, i) => {
      if (typeof s === 'string') {
        return { name: s, order: i + 1, startTime: null, endTime: null };
      }
      return { name: s.name, order: s.order || i + 1, startTime: s.startTime || null, endTime: s.endTime || null };
    });

    if (!sessions.length) throw new AppError('At least one session is required', 400);
    if (sessions.length > 10) throw new AppError('Maximum 10 sessions allowed', 400);

    // Duplicate name validation
    const names = sessions.map((s) => s.name.toLowerCase().trim());
    if (new Set(names).size !== names.length) throw new AppError('Session names must be unique', 400);

    // Duplicate order validation
    const orders = sessions.map((s) => s.order);
    if (new Set(orders).size !== orders.length) throw new AppError('Session order values must be unique', 400);

    return AttendanceConfig.findOneAndUpdate(
      { academicYearId },
      { academicYearId, mode, sessions },
      { new: true, upsert: true, runValidators: false }  // validation done above
    );
  }

  static async getAttendanceConfig(academicYearId) {
    const yearId = await SetupService.resolveAcademicYearId(academicYearId);
    return AttendanceConfig.findOne({ academicYearId: yearId });
  }

  // ═══════════════════════════════════════════════════════════
  //  PAYMENT SETTINGS (singleton)
  // ═══════════════════════════════════════════════════════════

  static async getPaymentSettings() {
    return PaymentSetting.findOne();
  }

  static async upsertPaymentSettings(data) {
    const existing = await PaymentSetting.findOne();
    if (existing) {
      Object.assign(existing, data);
      return existing.save();
    }
    return PaymentSetting.create(data);
  }
}

module.exports = SetupService;
