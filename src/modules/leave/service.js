const LeaveRequest = require('../../models/LeaveRequest');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const NotificationService = require('../notification/service');
const ActivityService = require('../activity/service');

class LeaveService {
  static async create({ studentId, fromDate, toDate, reason }) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);
    const student = await Student.findById(studentId);
    if (!student) throw new AppError('Student not found', 404);

    const leave = await LeaveRequest.create({ studentId, fromDate, toDate, reason });

    ActivityService.log({
      studentId, action: `Leave request created: ${reason}`,
      module: 'leave', metadata: { fromDate, toDate },
    }).catch(() => {});

    return leave.populate('studentId', 'name rollNo');
  }

  static async getAll(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.studentId && mongoose.isValidObjectId(filters.studentId)) {
      query.studentId = filters.studentId;
    }

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;

    const [leaves, total] = await Promise.all([
      LeaveRequest.find(query)
        .populate('studentId', 'name rollNo classId')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LeaveRequest.countDocuments(query),
    ]);

    return { leaves, total, page, limit };
  }

  static async approve(leaveId, userId) {
    if (!mongoose.isValidObjectId(leaveId)) throw new AppError('Invalid leave ID', 400);
    const leave = await LeaveRequest.findById(leaveId).populate('studentId', 'name parentId');
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'pending') throw new AppError('Leave is not pending', 400);

    leave.status = 'approved';
    leave.approvedBy = userId;
    await leave.save();

    // Notify parent
    this._notifyParent(leave.studentId, 'Leave Approved',
      `Leave for ${leave.studentId.name} from ${new Date(leave.fromDate).toLocaleDateString()} approved.`);

    return leave;
  }

  static async reject(leaveId, userId, remarks) {
    if (!mongoose.isValidObjectId(leaveId)) throw new AppError('Invalid leave ID', 400);
    const leave = await LeaveRequest.findById(leaveId).populate('studentId', 'name parentId');
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'pending') throw new AppError('Leave is not pending', 400);

    leave.status = 'rejected';
    leave.approvedBy = userId;
    leave.remarks = remarks || null;
    await leave.save();

    this._notifyParent(leave.studentId, 'Leave Rejected',
      `Leave for ${leave.studentId.name} has been rejected.${remarks ? ' Reason: ' + remarks : ''}`);

    return leave;
  }

  static async markOut(leaveId) {
    if (!mongoose.isValidObjectId(leaveId)) throw new AppError('Invalid leave ID', 400);
    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError('Leave not found', 404);
    if (leave.status !== 'approved') throw new AppError('Only approved leaves can be marked out', 400);
    if (leave.outTime) throw new AppError('Already marked out', 400);

    leave.outTime = new Date();
    await leave.save();
    return leave;
  }

  static async markIn(leaveId) {
    if (!mongoose.isValidObjectId(leaveId)) throw new AppError('Invalid leave ID', 400);
    const leave = await LeaveRequest.findById(leaveId);
    if (!leave) throw new AppError('Leave not found', 404);
    if (!leave.outTime) throw new AppError('Student has not been marked out yet', 400);
    if (leave.inTime) throw new AppError('Already marked in', 400);

    leave.inTime = new Date();
    await leave.save();
    return leave;
  }

  static _notifyParent(student, title, message) {
    if (!student?.parentId) return;
    const Parent = require('../../models/Parent');
    Parent.findById(student.parentId).then(p => {
      if (p?.userId) NotificationService.create(p.userId, {
        title, message, type: 'info',
        metadata: { studentId: student._id },
      });
    }).catch(() => {});
  }
}

module.exports = LeaveService;
