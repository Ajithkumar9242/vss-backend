const StaffDuty = require('../../models/StaffDuty');
const Faculty = require('../../models/Faculty');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

class DutyService {
  static async assign(data, userId) {
    if (!mongoose.isValidObjectId(data.facultyId)) throw new AppError('Invalid faculty ID', 400);
    const faculty = await Faculty.findById(data.facultyId);
    if (!faculty) throw new AppError('Faculty not found', 404);

    const duty = await StaffDuty.create({ ...data, assignedBy: userId });
    return duty.populate('facultyId', 'name employeeId');
  }

  static async getByDate(date) {
    if (!date) throw new AppError('Date is required', 400);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return StaffDuty.find({ date: { $gte: start, $lte: end } })
      .populate('facultyId', 'name employeeId designation')
      .populate('assignedBy', 'name')
      .sort({ dutyType: 1 })
      .lean();
  }

  static async getAll(filters = {}) {
    const query = {};
    if (filters.facultyId && mongoose.isValidObjectId(filters.facultyId)) {
      query.facultyId = filters.facultyId;
    }
    if (filters.dutyType) query.dutyType = filters.dutyType;

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;

    const [duties, total] = await Promise.all([
      StaffDuty.find(query)
        .populate('facultyId', 'name employeeId')
        .populate('assignedBy', 'name')
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StaffDuty.countDocuments(query),
    ]);

    return { duties, total, page, limit };
  }
}

module.exports = DutyService;
