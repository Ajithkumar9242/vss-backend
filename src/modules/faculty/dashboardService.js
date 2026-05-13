const Faculty    = require('../../models/Faculty');
const Student    = require('../../models/Student');
const Attendance = require('../../models/Attendance');
const Exam       = require('../../models/Exam');
const Mark       = require('../../models/Mark');
const Assignment = require('../../models/Assignment');
const AppError   = require('../../utils/AppError');
const mongoose   = require('mongoose');

/**
 * FacultyDashboardService — aggregate data for the faculty portal.
 */
class FacultyDashboardService {

  /**
   * Get the faculty record for the current user.
   */
  static async getFacultyProfile(userId) {
    const faculty = await Faculty.findOne({ userId })
      .populate('subjects',       'name code type')
      .populate('assignedClasses','name code')
      .populate('classTeacherOf', 'name code')
      .lean();
    return faculty;
  }

  /**
   * Dashboard summary: assigned classes, pending assignments to grade, etc.
   */
  static async getDashboard(userId) {
    const faculty = await FacultyDashboardService.getFacultyProfile(userId);
    if (!faculty) return { message: 'Faculty profile not linked. Contact admin.' };

    const classIds = faculty.assignedClasses.map((c) => c._id);

    // Count students across assigned classes
    const studentCount = await Student.countDocuments({
      classId: { $in: classIds },
      isActive: true,
    });

    // Pending assignment submissions to grade
    const assignmentIds = await Assignment.find({ facultyId: faculty._id, isActive: true }).distinct('_id');
    const Submission = require('../../models/Submission');
    const pendingGrade = await Submission.countDocuments({
      assignmentId: { $in: assignmentIds },
      status: 'submitted',
    });

    // Recent exams for assigned classes
    const recentExams = await Exam.find({
      classId: { $in: classIds },
      isActive: { $ne: false },
    })
      .populate('classId','name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return {
      faculty,
      stats: {
        classCount:    classIds.length,
        subjectCount:  faculty.subjects.length,
        studentCount,
        pendingGrade,
      },
      recentExams,
    };
  }

  /**
   * Students list for a given class with attendance % and last exam score.
   */
  static async getClassStudents(classId, facultyUserId) {
    if (!mongoose.isValidObjectId(classId)) throw new AppError('Invalid classId', 400);

    // Verify faculty has access to this class
    const faculty = await Faculty.findOne({ userId: facultyUserId }).lean();
    if (faculty) {
      const hasAccess = faculty.assignedClasses.some((c) => String(c) === String(classId));
      if (!hasAccess) throw new AppError('You are not assigned to this class', 403);
    }

    const students = await Student.find({ classId, isActive: true })
      .select('name rollNo gender dob')
      .sort({ rollNo: 1 })
      .lean();

    if (!students.length) return [];

    const studentIds = students.map((s) => s._id);

    // Attendance % for each student (last 30 days)
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const attRows = await Attendance.aggregate([
      { $match: { studentId: { $in: studentIds }, date: { $gte: since } } },
      {
        $group: {
          _id: '$studentId',
          total:   { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        },
      },
    ]);
    const attMap = {};
    attRows.forEach((r) => {
      attMap[String(r._id)] = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
    });

    // Latest exam mark per student (most recent graded exam)
    const marks = await Mark.find({ studentId: { $in: studentIds } })
      .sort({ createdAt: -1 })
      .limit(studentIds.length * 5)
      .lean();
    const markMap = {};
    marks.forEach((m) => {
      const key = String(m.studentId);
      if (!markMap[key]) markMap[key] = m;
    });

    return students.map((s) => ({
      ...s,
      attendancePct: attMap[String(s._id)] ?? null,
      lastMark: markMap[String(s._id)] ?? null,
    }));
  }

  /**
   * Class performance analytics for a specific exam.
   */
  static async getClassAnalytics(classId, examId) {
    if (!mongoose.isValidObjectId(classId)) throw new AppError('Invalid classId', 400);
    if (!mongoose.isValidObjectId(examId))  throw new AppError('Invalid examId', 400);

    const marks = await Mark.find({ examId, studentId: { $ne: null } })
      .populate('studentId', 'name rollNo')
      .lean();

    if (!marks.length) return { examId, classId, students: [], stats: {} };

    // Group by student
    const studentMap = {};
    marks.forEach((m) => {
      const sid = String(m.studentId?._id || m.studentId);
      if (!studentMap[sid]) {
        studentMap[sid] = {
          student: m.studentId,
          totalObtained: 0,
          totalMax: 0,
          subjects: [],
        };
      }
      studentMap[sid].totalObtained += m.marksObtained || 0;
      studentMap[sid].totalMax      += m.maxMarks      || 100;
      studentMap[sid].subjects.push(m);
    });

    const rows = Object.values(studentMap).map((r) => ({
      ...r,
      percentage: r.totalMax > 0 ? Math.round((r.totalObtained / r.totalMax) * 100) : 0,
    })).sort((a, b) => b.percentage - a.percentage);

    // Rank
    rows.forEach((r, i) => { r.rank = i + 1; });

    const exam = await Exam.findById(examId).lean();
    const passingMarks = exam?.passingMarks || 35;
    const passed = rows.filter((r) => r.percentage >= passingMarks).length;
    const failed = rows.length - passed;
    const avg    = rows.reduce((s, r) => s + r.percentage, 0) / (rows.length || 1);
    const WEAK_THRESHOLD = 40;
    const weakStudents = rows.filter((r) => r.percentage < WEAK_THRESHOLD);

    return {
      examId,
      classId,
      students: rows,
      stats: {
        total: rows.length,
        passed,
        failed,
        passPercentage: Math.round((passed / rows.length) * 100),
        averagePercentage: Math.round(avg),
        topper: rows[0] ? { name: rows[0].student?.name, percentage: rows[0].percentage } : null,
        weakStudents: weakStudents.map((s) => ({ name: s.student?.name, percentage: s.percentage })),
      },
    };
  }

  /**
   * Attendance summary per student for a given class + month.
   */
  static async getMonthlyAttendance(classId, year, month) {
    if (!mongoose.isValidObjectId(classId)) throw new AppError('Invalid classId', 400);

    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 0, 23, 59, 59);

    const rows = await Attendance.aggregate([
      { $match: { classId: new mongoose.Types.ObjectId(classId), date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id:     '$studentId',
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent']  }, 1, 0] } },
          late:    { $sum: { $cond: [{ $eq: ['$status', 'late']    }, 1, 0] } },
          total:   { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'students', localField: '_id', foreignField: '_id', as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $project: {
          studentName: '$student.name',
          rollNo:      '$student.rollNo',
          present: 1, absent: 1, late: 1, total: 1,
          percentage: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { rollNo: 1 } },
    ]);

    return { classId, year, month, rows };
  }
}

module.exports = FacultyDashboardService;
