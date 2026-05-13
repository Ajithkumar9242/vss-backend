const Subject = require('../../models/Subject');
const ClassConfig = require('../../models/ClassConfig');
const Class = require('../../models/Class');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Subject Service — full CRUD for subjects + ClassConfig assignment.
 */
class SubjectService {
  // ════════════════════════════════════════════════════════════
  //  CREATE
  // ════════════════════════════════════════════════════════════

  /**
   * Create a new subject.
   * Validates code uniqueness (case-insensitive).
   * @param {Object} data - { name, code, type, classId, isOptional }
   */
  static async create(data) {
    const code = data.code?.trim().toUpperCase();
    if (!code) throw new AppError('Subject code is required', 400);

    const exists = await Subject.findOne({ code });
    if (exists) {
      throw new AppError(`Subject with code '${code}' already exists`, 400);
    }

    if (data.classId && !mongoose.isValidObjectId(data.classId)) {
      throw new AppError('Invalid classId format', 400);
    }
    if (data.classId) {
      const cls = await Class.findById(data.classId);
      if (!cls) throw new AppError('Class not found', 404);
    }

    const subject = await Subject.create({
      name:       data.name.trim(),
      code,
      type:       data.type || 'theory',
      classId:    data.classId || null,
      isOptional: data.isOptional || false,
    });

    return subject.populate('classId', 'name code');
  }

  // ════════════════════════════════════════════════════════════
  //  READ
  // ════════════════════════════════════════════════════════════

  /**
   * Get all subjects with optional filters.
   * @param {Object} query - { classId, type, isActive, search, page, limit }
   */
  static async getAll(query = {}) {
    const filter = {};

    if (query.classId !== undefined) {
      if (query.classId === '' || query.classId === 'null') {
        filter.classId = null;
      } else if (mongoose.isValidObjectId(query.classId)) {
        filter.classId = query.classId;
      }
    }

    if (query.type && ['theory', 'practical', 'elective'].includes(query.type)) {
      filter.type = query.type;
    }

    // Default: only active subjects unless explicitly asked for inactive
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    } else {
      filter.isActive = true;
    }

    if (query.search) {
      const re = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: re }, { code: re }];
    }

    const page  = parseInt(query.page)  || 1;
    const limit = parseInt(query.limit) || 100;
    const skip  = (page - 1) * limit;

    const [subjects, total] = await Promise.all([
      Subject.find(filter)
        .populate('classId', 'name code')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Subject.countDocuments(filter),
    ]);

    return { subjects, total, page, limit };
  }

  // ════════════════════════════════════════════════════════════
  //  UPDATE
  // ════════════════════════════════════════════════════════════

  /**
   * Update an existing subject.
   * @param {string} id
   * @param {Object} data - { name, code, type, classId, isOptional, isActive }
   */
  static async update(id, data) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('Invalid subject ID', 400);
    }

    const subject = await Subject.findById(id);
    if (!subject) throw new AppError('Subject not found', 404);

    // If code is changing, verify uniqueness
    if (data.code) {
      const newCode = data.code.trim().toUpperCase();
      if (newCode !== subject.code) {
        const duplicate = await Subject.findOne({ code: newCode, _id: { $ne: id } });
        if (duplicate) {
          throw new AppError(`Subject with code '${newCode}' already exists`, 400);
        }
        subject.code = newCode;
      }
    }

    if (data.name     !== undefined) subject.name       = data.name.trim();
    if (data.type     !== undefined) subject.type       = data.type;
    if (data.isOptional !== undefined) subject.isOptional = data.isOptional;
    if (data.isActive !== undefined) subject.isActive   = data.isActive;

    if (data.classId !== undefined) {
      if (!data.classId) {
        subject.classId = null;
      } else {
        if (!mongoose.isValidObjectId(data.classId)) {
          throw new AppError('Invalid classId format', 400);
        }
        const cls = await Class.findById(data.classId);
        if (!cls) throw new AppError('Class not found', 404);
        subject.classId = data.classId;
      }
    }

    await subject.save();
    return subject.populate('classId', 'name code');
  }

  // ════════════════════════════════════════════════════════════
  //  SOFT DELETE  (isActive = false)
  // ════════════════════════════════════════════════════════════

  /**
   * Soft-delete a subject by setting isActive = false.
   * @param {string} id
   */
  static async softDelete(id) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('Invalid subject ID', 400);
    }
    const subject = await Subject.findById(id);
    if (!subject) throw new AppError('Subject not found', 404);

    subject.isActive = false;
    await subject.save();
    return subject;
  }

  // ════════════════════════════════════════════════════════════
  //  TOGGLE ACTIVE / INACTIVE
  // ════════════════════════════════════════════════════════════

  /**
   * Toggle isActive for a subject.
   * @param {string} id
   */
  static async toggleActive(id) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('Invalid subject ID', 400);
    }
    const subject = await Subject.findById(id);
    if (!subject) throw new AppError('Subject not found', 404);

    subject.isActive = !subject.isActive;
    await subject.save();
    return subject;
  }

  // ════════════════════════════════════════════════════════════
  //  ASSIGN TO CLASS CONFIG
  // ════════════════════════════════════════════════════════════

  /**
   * Add or remove a subject from a ClassConfig's subjects array.
   * @param {string} classConfigId
   * @param {string} subjectId
   * @param {'add'|'remove'} action
   */
  static async assignToClassConfig(classConfigId, subjectId, action = 'add') {
    if (!mongoose.isValidObjectId(classConfigId)) {
      throw new AppError('Invalid classConfigId', 400);
    }
    if (!mongoose.isValidObjectId(subjectId)) {
      throw new AppError('Invalid subjectId', 400);
    }

    const config = await ClassConfig.findById(classConfigId);
    if (!config) throw new AppError('ClassConfig not found', 404);

    const subject = await Subject.findById(subjectId);
    if (!subject) throw new AppError('Subject not found', 404);
    if (!subject.isActive) throw new AppError('Cannot assign an inactive subject', 400);

    if (action === 'add') {
      if (!config.subjects.map(String).includes(String(subjectId))) {
        config.subjects.push(subjectId);
      }
    } else if (action === 'remove') {
      config.subjects = config.subjects.filter((s) => String(s) !== String(subjectId));
    } else {
      throw new AppError("Action must be 'add' or 'remove'", 400);
    }

    await config.save();

    return ClassConfig.findById(classConfigId)
      .populate('classId', 'name code')
      .populate('subjects', 'name code type');
  }
}

module.exports = SubjectService;
