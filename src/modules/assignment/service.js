const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Student    = require('../../models/Student');
const Faculty    = require('../../models/Faculty');
const AppError   = require('../../utils/AppError');
const mongoose   = require('mongoose');
const ActivityService = require('../activity/service');

/**
 * AssignmentService — all business logic for assignments + submissions.
 */
class AssignmentService {
  // ═══════════════════════════════════════════════════════════
  //  ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════

  static async create(data, user) {
    const { title, description, classId, subjectId, dueDate, maxMarks, attachments } = data;

    if (!title)     throw new AppError('Title is required', 400);
    if (!classId)   throw new AppError('classId is required', 400);
    if (!subjectId) throw new AppError('subjectId is required', 400);
    if (!dueDate)   throw new AppError('dueDate is required', 400);

    // Resolve facultyId from user
    const faculty = await Faculty.findOne({ userId: user._id }).lean();
    if (!faculty && user.role !== 'admin' && user.role !== 'super_admin') {
      throw new AppError('Faculty profile not found for your account', 403);
    }
    const facultyId = faculty?._id || data.facultyId;

    const assignment = await Assignment.create({
      title: title.trim(),
      description: description?.trim() || '',
      classId,
      subjectId,
      facultyId,
      dueDate: new Date(dueDate),
      maxMarks: maxMarks ?? 100,
      attachments: attachments || [],
    });

    // Notify students in the class (non-blocking)
    AssignmentService._notifyAssignmentCreated(assignment).catch(() => {});

    ActivityService.log({
      action: `Assignment created: ${assignment.title}`,
      module: 'assignment',
      performedBy: user._id,
      metadata: { assignmentId: assignment._id, classId, subjectId },
    }).catch(() => {});

    return AssignmentService._populateOne(assignment._id);
  }

  static async getAll(filters = {}, user = null) {
    const query = { isActive: true };
    if (filters.classId   && mongoose.isValidObjectId(filters.classId))   query.classId   = filters.classId;
    if (filters.subjectId && mongoose.isValidObjectId(filters.subjectId)) query.subjectId = filters.subjectId;
    if (filters.facultyId && mongoose.isValidObjectId(filters.facultyId)) query.facultyId = filters.facultyId;

    // Faculty isolation: faculty can only see assignments they created
    if (user && user.role === 'faculty') {
      const faculty = await Faculty.findOne({ userId: user._id }).select('_id').lean();
      if (faculty) {
        query.facultyId = faculty._id;
      }
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.min(100, parseInt(filters.limit) || 20);
    const skip  = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      Assignment.find(query)
        .populate('classId',   'name code')
        .populate('subjectId', 'name code')
        .populate('facultyId', 'name employeeId')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    return { assignments: docs, total, page, limit };
  }

  static async getById(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid assignment ID', 400);
    const doc = await AssignmentService._populateOne(id);
    if (!doc) throw new AppError('Assignment not found', 404);
    return doc;
  }

  static async update(id, data, user) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid assignment ID', 400);
    const assignment = await Assignment.findById(id);
    if (!assignment) throw new AppError('Assignment not found', 404);

    // Faculty can only edit their own; admin can edit all
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const faculty = await Faculty.findOne({ userId: user._id }).lean();
      if (!faculty || String(assignment.facultyId) !== String(faculty._id)) {
        throw new AppError('You can only edit your own assignments', 403);
      }
    }

    const allowed = ['title', 'description', 'dueDate', 'maxMarks', 'attachments', 'isActive'];
    allowed.forEach((k) => { if (data[k] !== undefined) assignment[k] = data[k]; });

    await assignment.save();
    return AssignmentService._populateOne(id);
  }

  static async remove(id, user) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid assignment ID', 400);
    const assignment = await Assignment.findById(id);
    if (!assignment) throw new AppError('Assignment not found', 404);

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const faculty = await Faculty.findOne({ userId: user._id }).lean();
      if (!faculty || String(assignment.facultyId) !== String(faculty._id)) {
        throw new AppError('You can only delete your own assignments', 403);
      }
    }

    assignment.isActive = false;
    await assignment.save();
    return { deleted: true };
  }

  // ═══════════════════════════════════════════════════════════
  //  SUBMISSIONS
  // ═══════════════════════════════════════════════════════════

  static async submit(assignmentId, studentId, data) {
    if (!mongoose.isValidObjectId(assignmentId)) throw new AppError('Invalid assignment ID', 400);

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment || !assignment.isActive) throw new AppError('Assignment not found', 404);

    const isLate = new Date() > new Date(assignment.dueDate);

    const submission = await Submission.findOneAndUpdate(
      { assignmentId, studentId },
      {
        fileUrl:     data.fileUrl     || null,
        fileName:    data.fileName    || null,
        mimeType:    data.mimeType    || null,
        remarks:     data.remarks     || '',
        submittedAt: new Date(),
        status:      isLate ? 'late' : 'submitted',
      },
      { upsert: true, new: true }
    );

    return submission;
  }

  static async getSubmissions(assignmentId, filters = {}) {
    if (!mongoose.isValidObjectId(assignmentId)) throw new AppError('Invalid assignment ID', 400);

    const query = { assignmentId };
    if (filters.status) query.status = filters.status;

    const submissions = await Submission.find(query)
      .populate('studentId', 'name rollNo')
      .populate('gradedBy',  'name email')
      .sort({ submittedAt: -1 })
      .lean();

    return submissions;
  }

  static async getStudentSubmission(assignmentId, studentId) {
    const sub = await Submission.findOne({ assignmentId, studentId }).lean();
    return sub || null;
  }

  static async grade(assignmentId, studentId, data, user) {
    const { marks, feedback } = data;
    if (marks === undefined || marks === null) throw new AppError('marks is required', 400);

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new AppError('Assignment not found', 404);
    if (marks > assignment.maxMarks) throw new AppError(`marks cannot exceed maxMarks (${assignment.maxMarks})`, 400);

    const submission = await Submission.findOneAndUpdate(
      { assignmentId, studentId },
      {
        marks,
        feedback: feedback || '',
        status:   'graded',
        gradedAt: new Date(),
        gradedBy: user._id,
      },
      { new: true }
    );

    if (!submission) throw new AppError('Submission not found', 404);

    ActivityService.log({
      action: `Assignment graded: ${assignment.title} | Student: ${studentId} | Marks: ${marks}`,
      module: 'assignment',
      performedBy: user._id,
      metadata: { assignmentId, studentId, marks, feedback },
    }).catch(() => {});

    return submission;
  }

  // ═══════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  static _populateOne(id) {
    return Assignment.findById(id)
      .populate('classId',   'name code')
      .populate('subjectId', 'name code')
      .populate('facultyId', 'name employeeId')
      .lean();
  }

  static async _notifyAssignmentCreated(assignment) {
    try {
      const NotificationService = require('../notification/service');
      await NotificationService.broadcast({
        target:  'class',
        classId: assignment.classId,
        title:   `New Assignment: ${assignment.title}`,
        message: `A new assignment has been posted. Due: ${new Date(assignment.dueDate).toLocaleDateString('en-IN')}.`,
        type:    'info',
        metadata: { assignmentId: assignment._id, module: 'assignment' },
      });
    } catch (e) {
      console.error('[AssignmentService] Notify failed:', e.message);
    }
  }
}

module.exports = AssignmentService;
