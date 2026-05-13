const ActivityLog = require('../../models/ActivityLog');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Activity Service — student timeline and activity tracking.
 */
class ActivityService {
  /**
   * Log an activity event.
   */
  static async log({ studentId = null, action, module, performedBy = null, metadata = null }) {
    const entry = await ActivityLog.create({
      studentId,
      action,
      module,
      performedBy,
      metadata,
    });
    return entry;
  }

  /**
   * Get activity timeline for a specific student.
   */
  static async getByStudent(studentId, { page = 1, limit = 30 } = {}) {
    if (!mongoose.isValidObjectId(studentId)) {
      throw new AppError('Invalid student ID format', 400);
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      ActivityLog.find({ studentId })
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments({ studentId }),
    ]);

    return { logs, total, page, limit };
  }

  /**
   * Get recent activity across all students.
   */
  static async getRecent({ page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      ActivityLog.find()
        .populate('studentId', 'name rollNo')
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(),
    ]);

    return { logs, total, page, limit };
  }
}

module.exports = ActivityService;
