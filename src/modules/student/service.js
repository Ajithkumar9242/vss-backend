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
    // Search by name or rollNo
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { rollNo: { $regex: query.search, $options: 'i' } },
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

    // Auto-generate roll number
    const rollNo = await AdmissionService.generateRollNo(data.classId);



    const student = await Student.create({
      ...data,
      rollNo,
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
}

module.exports = StudentService;
