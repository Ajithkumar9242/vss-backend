const Parent = require('../../models/Parent');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Parent Service — parent management and student linking.
 */
class ParentService {
  static async create(data) {
    const parent = await Parent.create(data);
    return parent;
  }

  static async getAll({ page = 1, limit = 20, search } = {}) {
    const filter = { isActive: true };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [parents, total] = await Promise.all([
      Parent.find(filter)
        .populate('linkedStudents', 'name rollNo classId studentPhoto avatar photo admissionId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Parent.countDocuments(filter),
    ]);

    return { parents, total, page, limit };
  }

  static async getById(parentId) {
    if (!mongoose.isValidObjectId(parentId)) {
      throw new AppError('Invalid parent ID format', 400);
    }

    const parent = await Parent.findById(parentId)
      .populate({
        path: 'linkedStudents',
        select: 'name rollNo classId studentPhoto avatar photo admissionId',
        populate: { path: 'classId', select: 'name code' },
      });

    if (!parent) throw new AppError('Parent not found', 404);
    return parent;
  }

  static async linkStudent(parentId, studentId) {
    if (!mongoose.isValidObjectId(parentId) || !mongoose.isValidObjectId(studentId)) {
      throw new AppError('Invalid ID format', 400);
    }

    const [parent, student] = await Promise.all([
      Parent.findById(parentId),
      Student.findById(studentId),
    ]);

    if (!parent) throw new AppError('Parent not found', 404);
    if (!student) throw new AppError('Student not found', 404);

    // Avoid duplicate links
    if (!parent.linkedStudents.includes(studentId)) {
      parent.linkedStudents.push(studentId);
      await parent.save();
    }

    // Also set parentId on student
    student.parentId = parentId;
    await student.save();

    return Parent.findById(parentId).populate('linkedStudents', 'name rollNo');
  }

  /**
   * Update a parent's own profile (self-service).
   * Only allows editing: phone, email, address, occupation.
   * @param {string} userId — logged-in user._id
   * @param {Object} updates
   */
  static async updateMyProfile(userId, updates) {
    const parent = await Parent.findOne({ userId });
    if (!parent) throw new AppError('Parent profile not found for this account', 404);

    const oldPhone = parent.phone;

    // Whitelist editable fields only
    const allowed = ['phone', 'email', 'address', 'occupation'];
    allowed.forEach((field) => {
      if (updates[field] !== undefined) parent[field] = updates[field];
    });

    await parent.save();

    if (updates.phone && oldPhone !== updates.phone) {
      const { syncPhoneNumbers } = require('../../utils/phoneSync');
      syncPhoneNumbers({
        parentId: parent._id,
        userId,
        newPhone: updates.phone,
        oldPhone
      }).catch(err => console.error('[ParentMyProfileUpdate PhoneSync Error]:', err));
    }

    return parent;
  }

  /**
   * Partial update of a parent record (e.g. photo).
   * Never overwrites with null/undefined.
   * @param {string} parentId
   * @param {Object} updates
   */
  static async update(parentId, updates) {
    if (!mongoose.isValidObjectId(parentId)) {
      throw new AppError('Invalid parent ID format', 400);
    }

    const clean = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    });

    const oldParent = await Parent.findById(parentId).select('phone userId').lean();

    const parent = await Parent.findByIdAndUpdate(
      parentId,
      { $set: clean },
      { new: true, runValidators: true }
    ).populate('linkedStudents', 'name rollNo');

    if (!parent) throw new AppError('Parent not found', 404);

    if (oldParent && clean.phone && oldParent.phone !== clean.phone) {
      const { syncPhoneNumbers } = require('../../utils/phoneSync');
      syncPhoneNumbers({
        parentId,
        userId: oldParent.userId,
        newPhone: clean.phone,
        oldPhone: oldParent.phone
      }).catch(err => console.error('[ParentUpdate PhoneSync Error]:', err));
    }

    return parent;
  }
}

module.exports = ParentService;
