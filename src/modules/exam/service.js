const Exam = require('../../models/Exam');
const Mark = require('../../models/Mark');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const ActivityService = require('../activity/service');

/**
 * ExamService — full ERP lifecycle:
 *   Draft → Published → Locked
 *
 * Business rules:
 *   • Cannot edit exam metadata once Published
 *   • Cannot change maxMarks once marks exist
 *   • Marks entry requires Published status
 *   • Cannot edit marks once Locked
 */
class ExamService {
  static async getModuleStatus() {
    return { module: 'exam', status: 'operational' };
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Normalize subjects input to flat ObjectId array.
   * Handles: plain string IDs, ObjectIds, populated docs, old nested {subjectId} objects.
   */
  static _normalizeSubjectIds(subjects = []) {
    return subjects
      .map((s) => {
        if (!s) return null;
        if (typeof s === 'string') return s;
        if (s instanceof mongoose.Types.ObjectId) return s;
        if (s.subjectId) return s.subjectId?._id || s.subjectId;
        if (s._id) return s._id;
        return s;
      })
      .filter(Boolean);
  }

  /**
   * Serialize exam document to consistent API response.
   * Always returns examName + name (both), flat subjects array.
   */
  static _serialize(exam) {
    const obj = typeof exam.toObject === 'function' ? exam.toObject() : { ...exam };

    // Backward compat: normalize old nested subjects
    let subjects = obj.subjects || [];
    if (subjects.length > 0 && subjects[0]?.subjectId !== undefined) {
      subjects = subjects.map((s) => s.subjectId).filter(Boolean);
    }

    // Derive status label
    let status = 'draft';
    if (obj.isLocked) status = 'locked';
    else if (obj.isPublished) status = 'published';

    return {
      _id: obj._id,
      name: obj.name,
      examName: obj.name,           // alias
      term: obj.term || null,       // 'term1' | 'term2' | null
      classId: obj.classId,
      academicYearId: obj.academicYearId,
      subjects,
      maxMarks: obj.maxMarks,
      passingMarks: obj.passingMarks,
      startDate: obj.startDate || obj.examDate,
      endDate: obj.endDate,
      isPublished: obj.isPublished,
      isLocked: obj.isLocked,
      isActive: obj.isActive,
      status,
      createdAt: obj.createdAt,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  SUBJECTS
  // ═══════════════════════════════════════════════════════════

  static async getSubjectsForClass(classId) {
    const ClassConfig = require('../../models/ClassConfig');
    const Subject = require('../../models/Subject');

    // Try to get subjects from ClassConfig
    const config = classId
      ? await ClassConfig.findOne({ classId }).sort({ createdAt: -1 })
      : null;

    // Use ClassConfig subjects only if it has MORE than 1 subject
    // (single-subject configs are often misconfigured; fall back to all)
    if (config?.subjects?.length > 1) {
      const subs = await Subject.find(
        { _id: { $in: config.subjects }, isActive: { $ne: false } }
      ).select('name code type').sort({ name: 1 });
      if (subs.length > 1) return subs;
    }

    // Fallback: all active subjects
    return Subject.find({ isActive: { $ne: false } })
      .select('name code type').sort({ name: 1 }).limit(200);
  }

  // ═══════════════════════════════════════════════════════════
  //  EXAM CRUD
  // ═══════════════════════════════════════════════════════════

  static async createExam(data) {
    const SetupService = require('../setup/service');
    const examName = data.examName || data.name;
    if (!examName) throw new AppError('Exam name is required', 400);
    if (!data.classId) throw new AppError('classId is required', 400);
    if (!data.maxMarks || data.maxMarks < 1) throw new AppError('maxMarks must be >= 1', 400);

    // ── CBSE canonical exam structure validation ─────────────────────────────
    const CBSE_EXAM_RULES = {
      'periodic test':           { maxMarks: 10, autoTerm: null },
      'notebook':                { maxMarks: 5,  autoTerm: null },
      'sea':                     { maxMarks: 5,  autoTerm: null },
      'half yearly examination': { maxMarks: 80, autoTerm: 'term1' },
      'yearly examination':      { maxMarks: 80, autoTerm: 'term2' },
    };
    const normalizedName = examName.trim().toLowerCase();
    const cbseRule = CBSE_EXAM_RULES[normalizedName];

    if (cbseRule) {
      // Enforce correct maxMarks
      if (data.maxMarks !== cbseRule.maxMarks) {
        throw new AppError(
          `"${examName}" must have maxMarks = ${cbseRule.maxMarks} (CBSE school structure). Got ${data.maxMarks}.`,
          400
        );
      }
      // Auto-set term for HY/YE; require it for PT/NB/SEA
      if (cbseRule.autoTerm) {
        data.term = cbseRule.autoTerm;
      } else if (!data.term || !['term1', 'term2'].includes(data.term)) {
        throw new AppError(
          `"${examName}" requires a term (term1 or term2) since it appears in both terms.`,
          400
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const academicYearId = await SetupService.resolveAcademicYearId(data.academicYearId);
    const subjectIds = ExamService._normalizeSubjectIds(data.subjects || []);

    const exam = await Exam.create({
      name: examName,
      term: data.term || null,
      classId: data.classId,
      academicYearId: academicYearId || null,
      subjects: subjectIds,
      maxMarks: data.maxMarks,
      passingMarks: data.passingMarks ?? 35,
      startDate: data.startDate || data.examDate || null,
      endDate: data.endDate || null,
      isPublished: false,
      isLocked: false,
    });

    const populated = await exam.populate([
      { path: 'classId', select: 'name code' },
      { path: 'subjects', select: 'name code' },
    ]);

    // Notify faculty about new exam (non-blocking)
    ExamService._notifyExamCreated(populated).catch(() => {});

    return ExamService._serialize(populated);
  }

  static async getExams(filters = {}) {
    const query = { isActive: { $ne: false } };
    if (filters.classId && mongoose.isValidObjectId(filters.classId))
      query.classId = filters.classId;
    if (filters.academicYearId && mongoose.isValidObjectId(filters.academicYearId))
      query.academicYearId = filters.academicYearId;
    if (filters.status === 'published') query.isPublished = true;
    if (filters.status === 'draft') { query.isPublished = false; query.isLocked = false; }
    if (filters.status === 'locked') query.isLocked = true;

    const exams = await Exam.find(query)
      .populate('classId', 'name code')
      .populate('subjects', 'name code')
      .sort({ createdAt: -1 });

    return exams.map(ExamService._serialize);
  }

  static async getExamById(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId)
      .populate('classId', 'name code')
      .populate('subjects', 'name code');
    if (!exam) throw new AppError('Exam not found', 404);
    return ExamService._serialize(exam);
  }

  static async updateExam(examId, data, user) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);

    // Locked exams: nobody can edit
    if (exam.isLocked) throw new AppError('Locked exams cannot be edited', 400);

    // Published exams: only admin/super_admin can still edit
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    if (exam.isPublished && !isAdmin) {
      throw new AppError('Published exams can only be edited by admins', 403);
    }

    // Business rule: cannot change maxMarks if marks already exist
    if (data.maxMarks !== undefined && data.maxMarks !== exam.maxMarks) {
      const markCount = await Mark.countDocuments({ examId });
      if (markCount > 0) throw new AppError('Cannot change maxMarks after marks have been entered', 400);
    }

    const update = {};
    if (data.examName || data.name) update.name = data.examName || data.name;
    if (data.term !== undefined) update.term = data.term || null;
    if (data.maxMarks !== undefined) update.maxMarks = data.maxMarks;
    if (data.passingMarks !== undefined) update.passingMarks = data.passingMarks;
    if (data.startDate !== undefined) update.startDate = data.startDate || null;
    if (data.endDate !== undefined) update.endDate = data.endDate || null;
    if (data.examDate !== undefined) update.startDate = data.examDate || null;
    if (data.subjects !== undefined) update.subjects = ExamService._normalizeSubjectIds(data.subjects);

    const updated = await Exam.findByIdAndUpdate(examId, update, { new: true, runValidators: true })
      .populate('classId', 'name code')
      .populate('subjects', 'name code');
    return ExamService._serialize(updated);
  }

  static async deleteExam(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.isPublished) throw new AppError('Published exams cannot be deleted', 400);
    await Exam.findByIdAndUpdate(examId, { isActive: false });
    return { deleted: true };
  }

  static async publishExam(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.isPublished) throw new AppError('Exam is already published', 400);
    const updated = await Exam.findByIdAndUpdate(examId, { isPublished: true }, { new: true })
      .populate('classId', 'name code').populate('subjects', 'name code');
    ActivityService.log({ action: `Exam published: ${exam.name}`, module: 'exam', metadata: { examId } }).catch(() => { });

    // Notify students and parents (non-blocking)
    ExamService._notifyExamPublished(exam).catch(() => {});

    return ExamService._serialize(updated);
  }

  static async lockExam(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (!exam.isPublished) throw new AppError('Exam must be published before locking', 400);
    if (exam.isLocked) throw new AppError('Exam is already locked', 400);
    const updated = await Exam.findByIdAndUpdate(examId, { isLocked: true }, { new: true })
      .populate('classId', 'name code').populate('subjects', 'name code');
    ActivityService.log({ action: `Exam locked: ${exam.name}`, module: 'exam', metadata: { examId } }).catch(() => { });
    return ExamService._serialize(updated);
  }

  // ═══════════════════════════════════════════════════════════
  //  MARKS
  // ═══════════════════════════════════════════════════════════

  static async saveMarks(examId, marks, user) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (!exam.isPublished) throw new AppError('Marks can only be entered for published exams', 400);
    if (
      exam.isLocked &&
      user?.role !== 'admin' &&
      user?.role !== 'super_admin'
    ) {
      throw new AppError('This exam is locked. Marks cannot be edited.', 400);
    }
    const maxM = exam.maxMarks || 100;
    const passing = exam.passingMarks ?? 35;

    // Validate
    for (const m of marks) {
      if (m.marksObtained > maxM) {
        throw new AppError(`marksObtained (${m.marksObtained}) exceeds maxMarks (${maxM})`, 400);
      }
    }

    const ops = marks.map((m) => ({
      updateOne: {
        filter: {
          examId: new mongoose.Types.ObjectId(examId),
          studentId: new mongoose.Types.ObjectId(m.studentId),
          subjectId: new mongoose.Types.ObjectId(m.subjectId),
        },
        update: {
          $set: {
            examId, studentId: m.studentId, subjectId: m.subjectId,
            marksObtained: m.marksObtained,
            maxMarks: maxM,
            passed: m.marksObtained >= passing,
            grade: ExamService._computeGrade(m.marksObtained, maxM),
          },
        },
        upsert: true,
      },
    }));

    const result = await Mark.bulkWrite(ops);
    ActivityService.log({
      action: `Marks entered: ${marks.length} entries in exam "${exam.name}"`,
      module: 'exam', metadata: { examId, count: marks.length },
    }).catch(() => { });

    return { saved: result.upsertedCount || 0, updated: result.modifiedCount || 0, total: marks.length };
  }

  static async getExamMarks(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId)
      .populate('classId', 'name code').populate('subjects', 'name code').lean();
    if (!exam) throw new AppError('Exam not found', 404);
    const marks = await Mark.find({ examId })
      .populate('studentId', 'name rollNo admissionNo admissionNumber registerNo').populate('subjectId', 'name code')
      .sort({ createdAt: 1 }).lean();
    return { exam: ExamService._serialize(exam), marks };
  }

  // ═══════════════════════════════════════════════════════════
  //  RESULTS — per exam (all students)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get results for all students in an exam.
   * Returns:
   *  - exam metadata
   *  - stats: average%, pass%, topper
   *  - students: [{student, subjects, total, %, grade, result, rank}]
   */
  static async getExamResults(examId) {
    if (!mongoose.isValidObjectId(examId)) throw new AppError('Invalid exam ID', 400);
    const exam = await Exam.findById(examId)
      .populate('classId', 'name code').populate('subjects', 'name code').lean();
    if (!exam) throw new AppError('Exam not found', 404);

    // Get all students in the class
    const students = await Student.find({ classId: exam.classId._id || exam.classId })
      .select('name rollNo admissionNo admissionNumber registerNo').sort({ rollNo: 1 }).lean();

    // Get all marks for this exam
    const marks = await Mark.find({ examId })
      .populate('subjectId', 'name code').lean();

    const maxM = exam.maxMarks || 100;
    const passing = exam.passingMarks ?? 35;
    const totalSubjects = (exam.subjects || []).length;
    const totalMax = totalSubjects * maxM;

    // Build per-student result
    const studentResults = students.map((student) => {
      const studentMarks = marks.filter(
        (m) => m.studentId?.toString() === student._id.toString()
      );
      const subjectResults = studentMarks.map((m) => ({
        subject: m.subjectId,
        marksObtained: m.marksObtained,
        maxMarks: m.maxMarks || maxM,
        passed: m.passed ?? m.marksObtained >= passing,
        grade: m.grade || ExamService._computeGrade(m.marksObtained, m.maxMarks || maxM),
        percentage: Math.round((m.marksObtained / (m.maxMarks || maxM)) * 1000) / 10,
      }));

      const totalObtained = subjectResults.reduce((s, r) => s + r.marksObtained, 0);
      const enteredMax = subjectResults.reduce((s, r) => s + r.maxMarks, 0);
      const percentage = enteredMax > 0
        ? Math.round((totalObtained / enteredMax) * 1000) / 10 : 0;
      const allPassed = subjectResults.length > 0 && subjectResults.every((r) => r.passed);
      const grade = ExamService._computeGrade(totalObtained, enteredMax || totalMax);

      return {
        student,
        subjects: subjectResults,
        totalObtained,
        totalMax: enteredMax || totalMax,
        percentage,
        grade,
        result: subjectResults.length === 0 ? 'Absent' : allPassed ? 'Pass' : 'Fail',
        marksEntered: subjectResults.length,
      };
    });

    // Rank (by totalObtained, descending; absent students at end)
    const ranked = [...studentResults].sort((a, b) => {
      if (a.result === 'Absent' && b.result !== 'Absent') return 1;
      if (b.result === 'Absent' && a.result !== 'Absent') return -1;
      return b.totalObtained - a.totalObtained;
    });
    ranked.forEach((r, i) => { r.rank = r.result === 'Absent' ? null : i + 1; });

    // Copy rank back to studentResults (same references)
    const rankMap = {};
    ranked.forEach((r) => { rankMap[r.student._id.toString()] = r.rank; });
    studentResults.forEach((r) => { r.rank = rankMap[r.student._id.toString()] ?? null; });

    // Stats
    const attendedResults = studentResults.filter((r) => r.result !== 'Absent');
    const passResults = attendedResults.filter((r) => r.result === 'Pass');
    const avgPct = attendedResults.length > 0
      ? Math.round(attendedResults.reduce((s, r) => s + r.percentage, 0) / attendedResults.length * 10) / 10
      : 0;
    const topper = ranked.find((r) => r.result !== 'Absent') || null;

    return {
      exam: ExamService._serialize(exam),
      stats: {
        totalStudents: students.length,
        marksEntered: attendedResults.length,
        passed: passResults.length,
        failed: attendedResults.length - passResults.length,
        passPercentage: attendedResults.length > 0
          ? Math.round((passResults.length / attendedResults.length) * 1000) / 10 : 0,
        averagePercentage: avgPct,
        topper: topper ? { name: topper.student.name, percentage: topper.percentage } : null,
      },
      students: studentResults,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  STUDENT RESULTS (all exams for one student)
  // ═══════════════════════════════════════════════════════════

  static async getStudentResults(studentId) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);
    const student = await Student.findById(studentId).populate('classId', 'name code').lean();
    if (!student) throw new AppError('Student not found', 404);

    const marks = await Mark.find({ studentId })
      .populate({
        path: 'examId',
        select: 'name maxMarks passingMarks classId academicYearId subjects isLocked',
        populate: { path: 'classId', select: 'name' },
      })
      .populate('subjectId', 'name code')
      .sort({ createdAt: -1 }).lean();

    // Group by exam
    const examMap = {};
    for (const m of marks) {
      if (!m.examId) continue;
      const eid = m.examId._id.toString();
      if (!examMap[eid]) examMap[eid] = { exam: m.examId, subjectResults: [], totalObtained: 0, totalMax: 0 };
      const maxM = m.maxMarks || m.examId.maxMarks || 100;
      examMap[eid].subjectResults.push({
        subject: m.subjectId, marksObtained: m.marksObtained,
        maxMarks: maxM,
        passed: m.passed ?? m.marksObtained >= (m.examId.passingMarks ?? 35),
        percentage: Math.round((m.marksObtained / maxM) * 1000) / 10,
        grade: m.grade || ExamService._computeGrade(m.marksObtained, maxM),
      });
      examMap[eid].totalObtained += m.marksObtained;
      examMap[eid].totalMax += maxM;
    }

    const results = await Promise.all(Object.values(examMap).map(async (entry) => {
      const pct = entry.totalMax > 0
        ? Math.round((entry.totalObtained / entry.totalMax) * 1000) / 10 : 0;
      const allPassed = entry.subjectResults.every((s) => s.passed);
      const grade = await ExamService._computeGradeDynamic(entry.totalObtained, entry.totalMax);
      return {
        exam: { _id: entry.exam._id, examName: entry.exam.name, name: entry.exam.name, className: entry.exam.classId?.name },
        subjects: entry.subjectResults,
        totalObtained: entry.totalObtained,
        totalMax: entry.totalMax,
        percentage: pct,
        grade,
        result: allPassed ? 'Pass' : 'Fail',
      };
    }));

    return { student, results };
  }

  // ─── Grade helpers ─────────────────────────────────────────

  static async _computeGradeDynamic(obtained, max) {
    if (max <= 0) return 'N/A';
    const pct = (obtained / max) * 100;
    try {
      const GradeConfig = require('../../models/GradeConfig');
      const grades = await GradeConfig.find().sort({ minMarks: -1 });
      if (grades.length > 0) {
        const matched = grades.find((g) => pct >= g.minMarks && pct <= g.maxMarks);
        return matched ? matched.name : 'F';
      }
    } catch { /* fall through */ }
    return ExamService._gradeFromPct(pct);
  }

  static _computeGrade(obtained, max) {
    if (!max || max <= 0) return 'N/A';
    return ExamService._gradeFromPct((obtained / max) * 100);
  }

  static _gradeFromPct(pct) {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 35) return 'D';
    return 'F';
  }

  // ─── Notification helpers ──────────────────────────────────

  /**
   * Notify faculty when a new exam is created.
   * Broadcasts to all faculty users.
   */
  static async _notifyExamCreated(exam) {
    try {
      const NotificationService = require('../notification/service');
      await NotificationService.broadcast({
        target: 'faculty',
        title: `New Exam: ${exam.name}`,
        message: `A new exam "${exam.name}" has been created for ${exam.classId?.name || 'your class'}.`,
        type: 'info',
        metadata: { examId: exam._id, module: 'exam' },
      });
    } catch (e) {
      console.error('[ExamService] _notifyExamCreated failed:', e.message);
    }
  }

  /**
   * Notify students and parents when exam is published.
   */
  static async _notifyExamPublished(exam) {
    try {
      const NotificationService = require('../notification/service');
      const classId = exam.classId?._id || exam.classId;

      await Promise.allSettled([
        NotificationService.broadcast({
          target: 'class',
          classId,
          title: `Exam Published: ${exam.name}`,
          message: `The exam "${exam.name}" has been published. Please prepare accordingly.`,
          type: 'success',
          metadata: { examId: exam._id, module: 'exam' },
        }),
        NotificationService.broadcast({
          target: 'parent',
          classId,
          title: `Upcoming Exam: ${exam.name}`,
          message: `Your child's exam "${exam.name}" has been scheduled. Check the ERP for details.`,
          type: 'info',
          metadata: { examId: exam._id, module: 'exam' },
        }),
      ]);
    } catch (e) {
      console.error('[ExamService] _notifyExamPublished failed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PDF GENERATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate a results PDF for an exam.
   * Streams a professional school result card PDF to the response.
   *
   * @param {string} examId
   * @param {object} res — Express response object (we pipe directly)
   */
  static async generateMarksCardPdf(studentId, res, opts = {}) {
    const { generateMarksCardPdf } = require('../../utils/pdf/marksCardPdf');
    await generateMarksCardPdf({
      res,
      studentId,
      academicYearId: opts.academicYearId || null,
      term: opts.term || null,
      examId: opts.examId || null,
    });
  }
}

module.exports = ExamService;
