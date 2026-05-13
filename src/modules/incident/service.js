const Incident = require('../../models/Incident');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const NotificationService = require('../notification/service');
const ActivityService = require('../activity/service');

class IncidentService {
  static async create(data, userId) {
    if (!mongoose.isValidObjectId(data.studentId)) throw new AppError('Invalid student ID', 400);
    const student = await Student.findById(data.studentId);
    if (!student) throw new AppError('Student not found', 404);

    const incident = await Incident.create({ ...data, reportedBy: userId });

    // Activity log
    ActivityService.log({
      studentId: data.studentId,
      action: `Incident reported: ${data.type} — ${data.description.slice(0, 60)}`,
      module: 'discipline', metadata: { type: data.type, severity: data.severity },
    }).catch(() => {});

    // Notify parent
    if (student.parentId) {
      const Parent = require('../../models/Parent');
      Parent.findById(student.parentId).then(p => {
        if (p?.userId) NotificationService.create(p.userId, {
          title: 'Discipline Incident',
          message: `Incident reported for ${student.name}: ${data.type}`,
          type: 'warning', metadata: { studentId: student._id },
        });
      }).catch(() => {});
    }

    return incident.populate('studentId', 'name rollNo');
  }

  static async updateAction(incidentId, actionTaken) {
    if (!mongoose.isValidObjectId(incidentId)) throw new AppError('Invalid incident ID', 400);
    const incident = await Incident.findById(incidentId);
    if (!incident) throw new AppError('Incident not found', 404);
    incident.actionTaken = actionTaken;
    await incident.save();
    return incident;
  }

  static async getByStudent(studentId) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);
    return Incident.find({ studentId })
      .populate('reportedBy', 'name')
      .sort({ date: -1 }).lean();
  }

  static async getAll(filters = {}) {
    const query = {};
    if (filters.type) query.type = filters.type;
    if (filters.studentId && mongoose.isValidObjectId(filters.studentId)) {
      query.studentId = filters.studentId;
    }
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;

    const [incidents, total] = await Promise.all([
      Incident.find(query)
        .populate('studentId', 'name rollNo')
        .populate('reportedBy', 'name')
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Incident.countDocuments(query),
    ]);

    return { incidents, total, page, limit };
  }
}

module.exports = IncidentService;
