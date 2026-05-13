const HealthRecord = require('../../models/HealthRecord');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const NotificationService = require('../notification/service');

class HealthService {
  static async create(data, userId) {
    if (!mongoose.isValidObjectId(data.studentId)) throw new AppError('Invalid student ID', 400);
    const student = await Student.findById(data.studentId);
    if (!student) throw new AppError('Student not found', 404);

    const record = await HealthRecord.create({ ...data, reportedBy: userId });

    // Notify parent
    if (student.parentId) {
      const Parent = require('../../models/Parent');
      Parent.findById(student.parentId).then(p => {
        if (p?.userId) NotificationService.create(p.userId, {
          title: 'Health Alert',
          message: `Health issue reported for ${student.name}: ${data.issue}`,
          type: 'warning', metadata: { studentId: student._id },
        });
      }).catch(() => {});
    }

    return record.populate('studentId', 'name rollNo');
  }

  static async getByStudent(studentId) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);
    return HealthRecord.find({ studentId })
      .populate('reportedBy', 'name')
      .sort({ date: -1 })
      .lean();
  }

  static async getAll(filters = {}) {
    const query = {};
    if (filters.studentId && mongoose.isValidObjectId(filters.studentId)) {
      query.studentId = filters.studentId;
    }
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;

    const [records, total] = await Promise.all([
      HealthRecord.find(query)
        .populate('studentId', 'name rollNo')
        .populate('reportedBy', 'name')
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      HealthRecord.countDocuments(query),
    ]);

    return { records, total, page, limit };
  }
}

module.exports = HealthService;
