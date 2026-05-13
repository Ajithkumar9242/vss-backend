const Faculty = require('../../models/Faculty');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const AuthService = require('../auth/service');

/**
 * Faculty Service — full CRUD for faculty management.
 */
class FacultyService {
  static async create(data) {
    // Auto-generate employeeId if not provided
    if (!data.employeeId) {
      const count = await Faculty.countDocuments();
      data.employeeId = `FAC-${String(count + 1).padStart(4, '0')}`;
    }

    const faculty = await Faculty.create(data);

    // Auto-create User account for faculty (if email provided)
    if (faculty.email) {
      AuthService.createFacultyUser(faculty).catch((e) =>
        console.error('Faculty user creation failed:', e.message)
      );
    }

    return Faculty.findById(faculty._id)
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name code');
  }

  static async getAll({ page = 1, limit = 20, search, isActive } = {}) {
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [faculty, total] = await Promise.all([
      Faculty.find(filter)
        .populate('subjects', 'name code')
        .populate('assignedClasses', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Faculty.countDocuments(filter),
    ]);

    return { faculty, total, page, limit };
  }

  static async getById(facultyId) {
    if (!mongoose.isValidObjectId(facultyId)) {
      throw new AppError('Invalid faculty ID format', 400);
    }

    const faculty = await Faculty.findById(facultyId)
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name code');

    if (!faculty) throw new AppError('Faculty not found', 404);
    return faculty;
  }

  static async assignClasses(facultyId, classIds) {
    if (!mongoose.isValidObjectId(facultyId)) {
      throw new AppError('Invalid faculty ID format', 400);
    }

    // Validate all classIds
    for (const id of classIds) {
      if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid class ID: ${id}`, 400);
      }
    }

    const faculty = await Faculty.findByIdAndUpdate(
      facultyId,
      { assignedClasses: classIds },
      { new: true }
    )
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name code');

    if (!faculty) throw new AppError('Faculty not found', 404);
    return faculty;
  }

  /**
   * Assign subjects to faculty.
   * Validates that subjectIds belong to at least one ClassConfig of the faculty's assigned classes.
   * @param {string} facultyId
   * @param {string[]} subjectIds
   */
  static async assignSubjects(facultyId, subjectIds) {
    if (!mongoose.isValidObjectId(facultyId)) {
      throw new AppError('Invalid faculty ID format', 400);
    }

    const faculty = await Faculty.findById(facultyId);
    if (!faculty) throw new AppError('Faculty not found', 404);

    // Validate subject IDs are valid ObjectIds
    for (const sid of subjectIds) {
      if (!mongoose.isValidObjectId(sid)) {
        throw new AppError(`Invalid subject ID: ${sid}`, 400);
      }
    }

    // If faculty has assigned classes, verify each subjectId appears in at least one ClassConfig
    if (faculty.assignedClasses && faculty.assignedClasses.length > 0) {
      const ClassConfig = require('../../models/ClassConfig');
      const AcademicYear = require('../../models/AcademicYear');

      const activeYear = await AcademicYear.findOne({ isActive: true }).select('_id');
      if (activeYear) {
        const configs = await ClassConfig.find({
          classId: { $in: faculty.assignedClasses },
          academicYearId: activeYear._id,
        }).select('subjects');

        // Collect all allowed subject IDs across all configs
        const allowedSubjectIds = new Set(
          configs.flatMap((c) => c.subjects.map((s) => s.toString()))
        );

        if (allowedSubjectIds.size > 0) {
          const invalid = subjectIds.filter((id) => !allowedSubjectIds.has(id.toString()));
          if (invalid.length > 0) {
            throw new AppError(
              `Subjects not assigned to faculty's classes: ${invalid.join(', ')}`,
              400
            );
          }
        }
      }
    }

    const updated = await Faculty.findByIdAndUpdate(
      facultyId,
      { subjects: subjectIds },
      { new: true }
    )
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name code');

    return updated;
  }

  /**
   * Partial update of a faculty record (e.g. avatar).
   * Strips null/undefined to avoid overwriting existing values.
   * @param {string} facultyId
   * @param {Object} updates
   */
  static async update(facultyId, updates) {
    if (!mongoose.isValidObjectId(facultyId)) {
      throw new AppError('Invalid faculty ID format', 400);
    }

    const clean = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });

    const faculty = await Faculty.findByIdAndUpdate(
      facultyId,
      { $set: clean },
      { new: true, runValidators: true }
    )
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name code');

    if (!faculty) throw new AppError('Faculty not found', 404);
    return faculty;
  }
}

module.exports = FacultyService;
