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
    // Search by name / roll / admission / register number / parent name / phone number
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { rollNo: { $regex: query.search, $options: 'i' } },
        { admissionNo: { $regex: query.search, $options: 'i' } },
        { admissionNumber: { $regex: query.search, $options: 'i' } },
        { registerNo: { $regex: query.search, $options: 'i' } },
        { parentName: { $regex: query.search, $options: 'i' } },
        { parentPhone: { $regex: query.search, $options: 'i' } },
        { "father.phone": { $regex: query.search, $options: 'i' } },
        { "mother.phone": { $regex: query.search, $options: 'i' } },
        { "guardian.phone": { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate('classId', 'name code')
        .populate('sectionId', 'name')
        .populate({
          path: 'admissionId',
          select: 'applicationNo status sectionId studentPhoto avatar',
          populate: { path: 'sectionId', select: 'name' }
        })
        .sort({ classId: 1, sectionId: 1, rollNo: 1, name: 1 })
        .skip(skip)
        .limit(limit),
      Student.countDocuments(filter),
    ]);

    const mappedStudents = students.map(s => {
      const studentObj = s.toObject();
      
      // Fallback sectionId from admissionId if missing on student record
      if (!studentObj.sectionId && studentObj.admissionId) {
        if (studentObj.admissionId.sectionId) {
          studentObj.sectionId = studentObj.admissionId.sectionId;
        }
      }
      
      // Fallback avatar / studentPhoto from admissionId if missing on student record
      if (!studentObj.avatar && !studentObj.studentPhoto) {
        if (studentObj.admissionId) {
          studentObj.avatar = studentObj.admissionId.studentPhoto || studentObj.admissionId.avatar || null;
          studentObj.studentPhoto = studentObj.admissionId.studentPhoto || studentObj.admissionId.avatar || null;
        }
      }
      
      return studentObj;
    });

    return { students: mappedStudents, total, page, limit };
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
      .populate({
        path: 'admissionId',
        select: 'applicationNo status approvedAt sectionId studentPhoto avatar',
        populate: { path: 'sectionId', select: 'name capacity' }
      });

    if (!student) {
      throw new AppError('Student not found', 404);
    }

    const studentObj = student.toObject();

    // Fallback sectionId from admissionId if missing on student record
    if (!studentObj.sectionId && studentObj.admissionId) {
      if (studentObj.admissionId.sectionId) {
        studentObj.sectionId = studentObj.admissionId.sectionId;
      }
    }

    // Fallback avatar / studentPhoto from admissionId if missing on student record
    if (!studentObj.avatar && !studentObj.studentPhoto) {
      if (studentObj.admissionId) {
        studentObj.avatar = studentObj.admissionId.studentPhoto || studentObj.admissionId.avatar || null;
        studentObj.studentPhoto = studentObj.admissionId.studentPhoto || studentObj.admissionId.avatar || null;
      }
    }

    return studentObj;
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
      admission = await Admission.findById(student.admissionId)
        .populate('sectionId', 'name capacity')
        .lean();
    }

    // Fallback sectionId from admission if missing on student
    if (!student.sectionId && admission?.sectionId) {
      student.sectionId = admission.sectionId;
    }

    // Fallback avatar / studentPhoto from admission if missing on student
    if (!student.avatar && !student.studentPhoto) {
      student.avatar = admission?.studentPhoto || admission?.avatar || null;
      student.studentPhoto = admission?.studentPhoto || admission?.avatar || null;
    }
    
    // Unify Student fields into admission object so profile UI sees everything in one place
    admission = {
      ...admission,
      ...student,
      studentName: student.name || admission?.studentName,
      father: { ...(admission?.father || {}), ...(student.father || {}) },
      mother: { ...(admission?.mother || {}), ...(student.mother || {}) },
      guardian: { ...(admission?.guardian || {}), ...(student.guardian || {}) },
      documentChecklist: { ...(admission?.documentChecklist || {}), ...(student.documentChecklist || {}) },
    };

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
    // NOTE: FeeStructure model does NOT exist in this codebase — do NOT require it.
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
      admissionNumber: data.admissionNumber || admissionNo || undefined,
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
   * Bulk import students from parsed CSV rows.
   * Each row is processed independently — failures do not abort the batch.
   *
   * @param {Array<Object>} rows  - parsed + validated row objects
   * @returns {{ created: number, skipped: number, failed: number, results: Array }}
   */
  static async bulkImport(rows) {
    const Class = require('../../models/Class');
    const Section = require('../../models/Section');
    const SetupService = require('../setup/service');
    const AdmissionService = require('../admission/service');

    // Pre-load all classes and sections once to avoid N+1 queries
    const [allClasses, allSections] = await Promise.all([
      Class.find({}).select('_id name code').lean(),
      require('../../models/Section').find({}).select('_id name classId').lean(),
    ]);

    const classMap = {};
    allClasses.forEach((c) => {
      classMap[c.name.trim().toLowerCase()] = c;
      classMap[c.code.trim().toLowerCase()] = c;
    });
    const sectionMap = {}; // "classId::sectionName" → section
    allSections.forEach((s) => {
      const key = `${s.classId.toString()}::${s.name.trim().toLowerCase()}`;
      sectionMap[key] = s;
    });

    const academicYearId = await SetupService.resolveAcademicYearId(null);

    const results = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      try {
        // ── Resolve class ────────────────────────────────────────
        const classKey = (row.class || row.className || '').trim().toLowerCase();
        const classDoc = classMap[classKey];
        if (!classDoc) {
          results.push({ row: rowNum, status: 'failed', reason: `Class "${row.class || row.className}" not found` });
          failed++;
          continue;
        }

        // ── Resolve section (optional) ───────────────────────────
        let sectionId = null;
        const sectionName = (row.section || row.sectionName || '').trim().toLowerCase();
        if (sectionName) {
          const secKey = `${classDoc._id.toString()}::${sectionName}`;
          const secDoc = sectionMap[secKey];
          if (secDoc) sectionId = secDoc._id;
          // Missing section is non-fatal — just leave null
        }

        // ── Admission number uniqueness check ────────────────────
        const admissionNo = (row.admissionNo || row.admissionNumber || '').trim() || null;
        const registerNo = (row.registerNo || '').trim() || null;

        if (admissionNo) {
          const dup = await Student.findOne({
            $or: [{ admissionNo }, { admissionNumber: admissionNo }],
          }).select('_id').lean();
          if (dup) {
            results.push({ row: rowNum, status: 'skipped', reason: `Duplicate admission number "${admissionNo}"`, name: row.studentName || row.name });
            skipped++;
            continue;
          }
        }

        if (registerNo) {
          const dup = await Student.findOne({ registerNo }).select('_id').lean();
          if (dup) {
            results.push({ row: rowNum, status: 'skipped', reason: `Duplicate register number "${registerNo}"`, name: row.studentName || row.name });
            skipped++;
            continue;
          }
        }

        // ── Required field validation ────────────────────────────
        const name = (row.studentName || row.name || '').trim();
        if (!name) {
          results.push({ row: rowNum, status: 'failed', reason: 'Student name is required' });
          failed++;
          continue;
        }

        const dob = row.dateOfBirth || row.dob || row.DOB;
        if (!dob || isNaN(new Date(dob).getTime())) {
          results.push({ row: rowNum, status: 'failed', reason: 'Valid date of birth is required (YYYY-MM-DD)', name });
          failed++;
          continue;
        }

        const gender = (row.gender || '').trim().toLowerCase();
        if (!['male', 'female', 'other'].includes(gender)) {
          results.push({ row: rowNum, status: 'failed', reason: `Invalid gender "${row.gender}" — must be male, female, or other`, name });
          failed++;
          continue;
        }

        const parentName = (row.parentName || row.guardianName || '').trim();
        const parentPhone = (row.parentPhone || row.phone || '').trim();
        if (!parentName || !parentPhone) {
          results.push({ row: rowNum, status: 'failed', reason: 'Parent name and phone are required', name });
          failed++;
          continue;
        }

        // ── Generate roll number ─────────────────────────────────
        const rollNo = await AdmissionService.generateRollNo(classDoc._id);

        // ── Create student ───────────────────────────────────────
        const student = await Student.create({
          name,
          dateOfBirth: new Date(dob),
          gender,
          classId: classDoc._id,
          sectionId,
          academicYearId,
          admissionId: null,
          rollNo,
          admissionNo: admissionNo || rollNo,
          admissionNumber: admissionNo || null,
          registerNo: registerNo || rollNo,
          parentName,
          parentPhone,
          parentEmail: (row.parentEmail || row.email || '').trim() || undefined,
          bloodGroup: (row.bloodGroup || '').trim() || undefined,
          address: (row.address || '').trim() || undefined,

          admissionDate: (row.admissionDate && !isNaN(new Date(row.admissionDate).getTime())) ? new Date(row.admissionDate) : undefined,
          mode: ['online', 'offline'].includes((row.mode || '').trim().toLowerCase()) ? (row.mode || '').trim().toLowerCase() : 'offline',
          type: ['residential', 'day-boarding'].includes((row.type || '').trim().toLowerCase()) ? (row.type || '').trim().toLowerCase() : 'day-boarding',
          secondLanguage: (row.secondLanguage || '').trim() || undefined,
          dobInWords: (row.dobInWords || '').trim() || undefined,
          placeOfBirth: (row.placeOfBirth || '').trim() || undefined,
          nationality: (row.nationality || '').trim() || 'Indian',
          religion: (row.religion || '').trim() || undefined,
          motherTongue: (row.motherTongue || '').trim() || undefined,
          aadhaarNo: (row.aadhaarNo || '').trim() || undefined,
          caste: (row.caste || '').trim() || undefined,
          category: ['General', 'OBC', 'SC', 'ST', 'Others'].includes((row.category || '').trim()) ? (row.category || '').trim() : 'General',
          previousSchool: (row.previousSchool || '').trim() || undefined,
          previousSchoolAddress: (row.previousSchoolAddress || '').trim() || undefined,
          previousBoard: (row.previousBoard || '').trim() || undefined,
          mediumOfInstruction: (row.mediumOfInstruction || '').trim() || undefined,
          classLastStudied: (row.classLastStudied || '').trim() || undefined,
          yearOfCompletion: (row.yearOfCompletion || '').trim() || undefined,
          tcNumber: (row.tcNumber || '').trim() || undefined,
          tcDate: (row.tcDate && !isNaN(new Date(row.tcDate).getTime())) ? new Date(row.tcDate) : undefined,
          satsNumber: (row.satsNumber || '').trim() || undefined,
          apaarNumber: (row.apaarNumber || '').trim() || undefined,
          penNumber: (row.penNumber || '').trim() || undefined,
          hasTC: String(row.hasTC).toLowerCase() === 'true' || String(row.hasTC) === '1',

          // Medical & SEN
          allergies: (row.allergies || '').trim() || undefined,
          medicalConditions: (row.medicalConditions || '').trim() || undefined,
          senType: (row.senType || '').trim() || undefined,
          senSupportLevel: ['Mild', 'Moderate', 'Intensive'].includes((row.senSupportLevel || '').trim()) ? (row.senSupportLevel || '').trim() : '',
        });

        // ── Non-blocking fee invoice ─────────────────────────────
        try {
          const FeesService = require('../fees/service');
          await FeesService.generateInvoice({
            studentId: student._id,
            classId: student.classId,
            academicYearId,
          });
        } catch (e) {
          console.error(`[BulkImport] Fee invoice failed for row ${rowNum}:`, e.message);
        }

        results.push({ row: rowNum, status: 'created', name, rollNo, admissionNo: student.admissionNo });
        created++;
      } catch (err) {
        results.push({
          row: rowNum,
          status: 'failed',
          reason: err.message || 'Unknown error',
          name: row.studentName || row.name || `Row ${rowNum}`,
        });
        failed++;
      }
    }

    return { created, skipped, failed, results };
  }

  static async updateStudent(studentId, updates) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new AppError('Invalid student ID format', 400);
    }

    // Strip undefined, but allow null or empty string to clear optional fields
    const clean = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (v !== undefined) clean[k] = v;
    });

    if (clean.admissionNo || clean.admissionNumber || clean.registerNo) {
      await StudentService._assertUniqueNumbers({
        admissionNo: clean.admissionNo ? String(clean.admissionNo).trim() : null,
        registerNo: clean.registerNo ? String(clean.registerNo).trim() : null,
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
