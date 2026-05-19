const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Student Service — business logic for student management.
 * Handles student listing and retrieval.
 */
class StudentService {
  /**
   * Get all students with filters and pagination.
   * @param {Object} query - { classId, sectionId, isActive, search, page, limit }
   * @returns {{ students: Array, total: number, page: number, limit: number }}
   */
  static async getStudents(query = {}) {
    const filter = {};

    // Only apply ObjectId filters when the value is a valid Mongo ID
    if (query.classId && mongoose.isValidObjectId(query.classId)) {
      filter.classId = query.classId;
    }
    if (query.sectionId && mongoose.isValidObjectId(query.sectionId)) {
      filter.sectionId = query.sectionId;
    }
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }
    // Search by name / roll / admission / register number
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { rollNo: { $regex: query.search, $options: 'i' } },
        { admissionNo: { $regex: query.search, $options: 'i' } },
        { admissionNumber: { $regex: query.search, $options: 'i' } },
        { registerNo: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate('classId', 'name code')
        .populate('sectionId', 'name')
        .populate('admissionId', 'applicationNo status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Student.countDocuments(filter),
    ]);

    return { students, total, page, limit };
  }

  /**
   * Get a single student by ID with full details.
   * @param {string} studentId
   * @returns {Object} student document
   */
  static async getStudentById(studentId) {
    const student = await Student.findById(studentId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name capacity')
      .populate('admissionId', 'applicationNo status approvedAt');

    if (!student) {
      throw new AppError('Student not found', 404);
    }

    return student;
  }

  /**
   * Get an aggregate student profile including admission, attendance, fees, and exams.
   * Returns the stable shape consumed by the Student Profile drawer.
   * @param {string} studentId
   */
  static async getStudentProfile(studentId) {
    const student = await Student.findById(studentId)
      .populate('classId', 'name code')
      .populate('sectionId', 'name capacity')
      .populate('academicYearId', 'name startDate endDate')
      .lean();

    if (!student) {
      throw new AppError('Student not found', 404);
    }

    // ─── Admission ──────────────────────────────────────────────
    let admission = null;
    if (student.admissionId) {
      const Admission = mongoose.model('Admission');
      admission = await Admission.findById(student.admissionId).lean();
    }

    // ─── Attendance ─────────────────────────────────────────────
    let attendance = { summary: { totalConducted: 0, totalAttended: 0, percentage: 0 }, monthly: [] };
    try {
      const AttendanceService = require('../attendance/service');
      const monthlyReport = await AttendanceService.getMonthlyStudentReport(student._id);
      if (monthlyReport) {
        const pct = monthlyReport.totalConducted > 0
          ? Math.round((monthlyReport.totalAttended / monthlyReport.totalConducted) * 1000) / 10
          : 0;
        attendance = {
          summary: {
            totalConducted: monthlyReport.totalConducted || 0,
            totalAttended: monthlyReport.totalAttended || 0,
            totalAbsent: Math.max(0, (monthlyReport.totalConducted || 0) - (monthlyReport.totalAttended || 0)),
            percentage: pct,
          },
          monthly: monthlyReport.monthWise || [],
        };
      }
    } catch (e) {
      console.warn('[Profile] attendance fetch failed:', e.message);
    }

    // ─── Fees (full invoice shape, same as parent portal) ────────
    let fees = { summary: null, invoice: null, installments: [], payments: [] };
    try {
      const FeesService = require('../fees/service');
      const SetupService = require('../setup/service');
      const FeePayment = require('../../models/FeePayment');

      let academicYearId = student.academicYearId?._id || student.academicYearId;
      if (!academicYearId) {
        academicYearId = await SetupService.resolveAcademicYearId(null);
      }

      const feeData = await FeesService.getInvoice(student._id, academicYearId);

      if (feeData) {
        const isShapeA = feeData.invoice !== undefined;
        const inv = isShapeA ? feeData.invoice : feeData;

        let payments = [];
        if (isShapeA && feeData.payments) {
          payments = feeData.payments;
        } else if (inv && inv._id) {
          payments = await FeePayment.find({ invoiceId: inv._id }).sort({ paidAt: -1 }).lean();
        }

        const summary = isShapeA && feeData.summary ? feeData.summary : (inv ? {
          totalFee: inv.netFee || 0,
          totalPaid: inv.paidAmount || 0,
          totalDue: inv.dueAmount || 0,
          grossFee: inv.grossFee || 0,
          discountAmount: inv.discountAmount || 0,
          penaltyAmount: inv.penaltyAmount || 0,
          status: ({ paid: 'Paid', partial: 'Partial', overdue: 'Overdue' })[inv.status] || 'Unpaid',
          nextDueDate: inv.nextDueDate || null,
        } : null);

        fees = {
          summary,
          invoice: inv ? {
            _id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            grossFee: inv.grossFee,
            netFee: inv.netFee,
            discountAmount: inv.discountAmount,
            penaltyAmount: inv.penaltyAmount,
            paidAmount: inv.paidAmount,
            dueAmount: inv.dueAmount,
            nextDueDate: inv.nextDueDate,
            locked: inv.locked,
          } : null,
          installments: inv?.installments || [],
          payments: payments || [],
        };
      }
      console.log('[Profile Fees]', { studentId: student._id, year: academicYearId, hasInvoice: !!fees.invoice, payments: fees.payments.length });
    } catch (e) {
      console.warn('[Profile] fees fetch failed:', e.message);
    }

    // ─── Exams ────────────────────────────────────────────────────
    let exams = { results: [], marksCard: null };
    try {
      const ExamService = require('../exam/service');
      const examData = await ExamService.getStudentResults(student._id.toString());
      const results = examData?.results || [];
      exams = {
        results,
        marksCard: results.length > 0 ? {
          examCount: results.length,
          overall: (() => {
            const total = results.reduce((s, r) => s + (r.totalMax || 0), 0);
            const obtained = results.reduce((s, r) => s + (r.totalObtained || 0), 0);
            return {
              totalObtained: obtained,
              totalMax: total,
              percentage: total > 0 ? Math.round((obtained / total) * 1000) / 10 : 0,
            };
          })(),
        } : null,
      };
    } catch (e) {
      console.warn('[Profile] exams fetch failed:', e.message);
    }

    return { student, admission, attendance, fees, exams };
  }

  /**
   * Directly create a student (admin flow — no admission required).
   * @param {Object} data - student data
   * @returns {Object} created student
   */
  static async createStudent(data) {
    const Class = require('../../models/Class');
    const Section = require('../../models/Section');
    const FeeStructure = require('../../models/FeeStructure');
    const SetupService = require('../setup/service');
    const AdmissionService = require('../admission/service');

    // Validate class
    const classDoc = await Class.findById(data.classId);
    if (!classDoc) throw new AppError('Class not found', 404);

    // Validate section belongs to class (if provided)
    if (data.sectionId) {
      const section = await Section.findById(data.sectionId);
      if (!section) throw new AppError('Section not found', 404);
      if (section.classId.toString() !== data.classId.toString()) {
        throw new AppError('Section does not belong to the selected class', 400);
      }
    }

    // Resolve academic year
    const academicYearId = await SetupService.resolveAcademicYearId(data.academicYearId);

    const admissionNo = (data.admissionNo || data.admissionNumber || '').trim() || null;
    const registerNo = (data.registerNo || '').trim() || null;

    await StudentService._assertUniqueNumbers({ admissionNo, registerNo });

    // Auto-generate roll number
    const rollNo = await AdmissionService.generateRollNo(data.classId);

    const student = await Student.create({
      ...data,
      rollNo,
      admissionNo: admissionNo || rollNo,
      admissionNumber: data.admissionNumber || admissionNo || null,
      registerNo: registerNo || rollNo,
      academicYearId,
      admissionId: null,
    });

    // Auto-generate fee invoice (non-blocking — student creation succeeds regardless)
    try {
      const FeesService = require('../fees/service');
      await FeesService.generateInvoice({
        studentId: student._id,
        classId: student.classId,
        academicYearId: student.academicYearId,
      });
    } catch (e) {
      console.error('Auto invoice generation failed (non-critical):', e.message);
    }

    return Student.findById(student._id)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('academicYearId', 'name');
  }

  /**
   * Update a student's fields (partial update).
   * Never overwrites existing value with null — skip undefined/null values.
   * @param {string} studentId
   * @param {Object} updates - e.g. { avatar: 'https://...' }
   */
  static async updateStudent(studentId, updates) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new AppError('Invalid student ID format', 400);
    }

    // Strip null/undefined to avoid overwriting good data
    const clean = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });

    if (clean.admissionNo || clean.admissionNumber || clean.registerNo) {
      await StudentService._assertUniqueNumbers({
        admissionNo: (clean.admissionNo || clean.admissionNumber || '').trim() || null,
        registerNo: (clean.registerNo || '').trim() || null,
        excludeId: studentId,
      });
      if (clean.admissionNo && !clean.admissionNumber) clean.admissionNumber = clean.admissionNo;
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: clean },
      { new: true, runValidators: true }
    )
      .populate('classId', 'name code')
      .populate('sectionId', 'name');

    if (!student) throw new AppError('Student not found', 404);
    return student;
  }

  static async _assertUniqueNumbers({ admissionNo, registerNo, excludeId = null }) {
    const or = [];
    if (admissionNo) {
      or.push({ admissionNo });
      or.push({ admissionNumber: admissionNo });
    }
    if (registerNo) or.push({ registerNo });
    if (!or.length) return;

    const query = { $or: or };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Student.findOne(query).select('admissionNo admissionNumber registerNo');
    if (!existing) return;
    if (admissionNo && [existing.admissionNo, existing.admissionNumber].includes(admissionNo)) {
      throw new AppError('Admission No already exists', 400);
    }
    if (registerNo && existing.registerNo === registerNo) {
      throw new AppError('Register No already exists', 400);
    }
  }
}

module.exports = StudentService;
