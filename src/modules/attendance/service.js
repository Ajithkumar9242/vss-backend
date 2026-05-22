const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const ActivityService = require('../activity/service');

/**
 * Attendance Service — business logic for attendance module.
 * All DB operations and data processing go here.
 */
class AttendanceService {
  /**
   * Get module operational status.
   */
  static async getModuleStatus() {
    return { module: 'attendance', status: 'Attendance module is operational' };
  }

  // ═══════════════════════════════════════════════════════════
  //  SESSIONS (from AttendanceConfig)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get sessions for the active academic year from AttendanceConfig.
   * Falls back to ['Morning'] if not configured.
   * @returns {string[]} sessions array
   */
  static async getSessions() {
    try {
      const AttendanceConfig = require('../../models/AttendanceConfig');
      const SetupService = require('../setup/service');
      const academicYearId = await SetupService.resolveAcademicYearId(null);
      if (academicYearId) {
        const config = await AttendanceConfig.findOne({ academicYearId });
        if (config && config.sessions && config.sessions.length > 0) {
          return config.sessions;
        }
      }
      // Fallback: any config at all
      const anyConfig = await AttendanceConfig.findOne().sort({ createdAt: -1 });
      if (anyConfig && anyConfig.sessions && anyConfig.sessions.length > 0) {
        return anyConfig.sessions;
      }
    } catch (e) {
      console.error('AttendanceConfig fetch failed:', e.message);
    }
    return ['Morning'];
  }

  // ═══════════════════════════════════════════════════════════
  //  MARK ATTENDANCE (bulk)
  // ═══════════════════════════════════════════════════════════

  /**
   * Save attendance records for a list of students on a given date + session.
   * Uses bulkWrite with upsert — idempotent re-submission.
   *
   * Lock check:
   *   - If a record is locked AND user is not admin/super_admin → throws 403
   *   - Admin can always override locked attendance
   *
   * @param {Array} records – [{ studentId, classId, sectionId, date, status, session?, remarks? }]
   * @param {string} markedBy – userId
   * @param {string} userRole – 'admin' | 'super_admin' | 'faculty' | etc.
   * @returns {{ saved, updated, total }}
   */
  static async markAttendance(records, markedBy, userRole = 'faculty') {
    if (!records || !records.length) {
      throw new AppError('No attendance records provided', 400);
    }

    const session = records[0]?.session || 'Morning';
    const date = new Date(records[0]?.date);
    const classId = records[0]?.classId;

    // Lock check — if this class+date+session has locked records and caller is not admin
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      const lockedCount = await Attendance.countDocuments({
        classId,
        date,
        session,
        isLocked: true,
      });
      if (lockedCount > 0) {
        throw new AppError(
          'Attendance for this class/date/session is locked. Only admin can modify it.',
          403
        );
      }
    }

    const ops = records.map((r) => ({
      updateOne: {
        filter: {
          studentId: r.studentId,
          date: new Date(r.date),
          session: r.session || 'Morning',
        },
        update: {
          $set: {
            studentId: r.studentId,
            classId: r.classId,
            sectionId: r.sectionId || null,
            date: new Date(r.date),
            session: r.session || 'Morning',
            status: r.status,
            markedBy: markedBy || null,
            remarks: r.remarks || null,
            // Preserve existing lock (don't unlock via mark)
          },
          $setOnInsert: { isLocked: false },
        },
        upsert: true,
      },
    }));

    const result = await Attendance.bulkWrite(ops);

    // Activity log (non-blocking)
    ActivityService.log({
      action: `Attendance marked — ${records.length} students | Session: ${session}`,
      module: 'attendance',
      performedBy: markedBy || null,
      metadata: { classId, date, session, count: records.length },
    }).catch((e) => console.error('Activity log failed:', e.message));

    return {
      saved: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
      total: records.length,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  LOCK ATTENDANCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Lock attendance for a class + date + session.
   * Once locked, only admin can re-mark.
   * @param {{ classId, date, session }} params
   * @returns {{ locked: number, summary: { present, absent, total } }}
   */
  static async lockAttendance({ classId, date, session }) {
    if (!classId || !date) throw new AppError('classId and date are required', 400);

    const query = {
      classId,
      date: new Date(date),
      session: session || 'Morning',
    };

    const result = await Attendance.updateMany(query, { $set: { isLocked: true } });

    // Build summary
    const records = await Attendance.find(query).lean();
    const present = records.filter((r) => r.status === 'present').length;
    const absent = records.filter((r) => r.status === 'absent').length;

    return {
      locked: result.modifiedCount,
      summary: { total: records.length, present, absent },
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  GET ATTENDANCE — for a class/date/session
  // ═══════════════════════════════════════════════════════════

  /**
   * Get attendance records for a specific date + class + session.
   * Returns populated student data + lock status.
   */
  static async getAttendanceByDate({ classId, sectionId, date, session }) {
    const query = {};
    if (date) query.date = new Date(date);
    if (classId) query.classId = classId;
    if (sectionId) query.sectionId = sectionId;
    if (session) query.session = session;

    const records = await Attendance.find(query)
      .populate('studentId', 'name rollNo')
      .sort({ 'studentId.rollNo': 1 })
      .lean();

    return records;
  }

  // ═══════════════════════════════════════════════════════════
  //  VIEW ATTENDANCE — aggregated report
  // ═══════════════════════════════════════════════════════════

  /**
   * Get aggregated attendance summary for students.
   * Filters: classId (required), dateFrom, dateTo, session (optional)
   * Returns per-student: totalPresent, totalAbsent, totalLate, totalDays, percentage
   */
  static async getAttendanceReport({ classId, dateFrom, dateTo, session }) {
    if (!classId) {
      throw new AppError('Class filter is required for attendance report', 400);
    }

    if (!mongoose.isValidObjectId(classId)) {
      throw new AppError('Invalid class ID format', 400);
    }

    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);

    const matchStage = { classId: new mongoose.Types.ObjectId(classId) };
    if (Object.keys(dateFilter).length) matchStage.date = dateFilter;
    if (session) matchStage.session = session;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$studentId',
          totalPresent: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] },
          },
          totalAbsent: {
            $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] },
          },
          totalLate: {
            $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] },
          },
          totalDays: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $project: {
          _id: 1,
          studentName: '$student.name',
          rollNo: '$student.rollNo',
          totalPresent: 1,
          totalAbsent: 1,
          totalLate: 1,
          totalDays: 1,
          percentage: {
            $cond: [
              { $gt: ['$totalDays', 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ['$totalPresent', '$totalDays'] }, 100] },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { rollNo: 1 } },
    ];

    const report = await Attendance.aggregate(pipeline);

    // Append overall stats
    const totalPresent = report.reduce((s, r) => s + r.totalPresent, 0);
    const totalAbsent = report.reduce((s, r) => s + r.totalAbsent, 0);
    const avgPercentage = report.length
      ? Math.round((report.reduce((s, r) => s + r.percentage, 0) / report.length) * 10) / 10
      : 0;

    return { report, stats: { totalPresent, totalAbsent, avgPercentage, studentCount: report.length } };
  }

  // ═══════════════════════════════════════════════════════════
  //  MONTHLY ATTENDANCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Upsert monthly attendance for a class+month.
   * rows: [{ studentId, attendedClasses }]
   */
  static async upsertMonthlyAttendance({ classId, monthKey, totalClassesConducted, rows, userId, academicYearId }) {
    if (!classId || !monthKey) throw new AppError('classId and monthKey are required', 400);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new AppError('monthKey must be YYYY-MM', 400);
    if (typeof totalClassesConducted !== 'number' || totalClassesConducted < 0) {
      throw new AppError('totalClassesConducted must be a non-negative number', 400);
    }
    if (!Array.isArray(rows)) throw new AppError('rows must be an array', 400);
    for (const row of rows) {
      if ((row.attendedClasses || 0) > totalClassesConducted) {
        throw new AppError(
          `A student has attendedClasses (${row.attendedClasses}) > totalClassesConducted (${totalClassesConducted})`,
          400
        );
      }
      if ((row.attendedClasses || 0) < 0) throw new AppError('attendedClasses cannot be negative', 400);
    }

    const MonthlyAttendance = require('../../models/MonthlyAttendance');

    // First check if a record already exists for this class and monthKey under any academic year
    let existingDoc = await MonthlyAttendance.findOne({ classId, monthKey });

    let targetAcademicYearId = academicYearId;
    if (existingDoc) {
      targetAcademicYearId = existingDoc.academicYearId;
    } else if (!targetAcademicYearId) {
      // Resolve academicYearId from SetupService if not supplied by caller
      try {
        const SetupService = require('../setup/service');
        targetAcademicYearId = await SetupService.resolveAcademicYearId(null);
      } catch { /* leave null — index allows null but groups consistently */ }
    }

    const doc = await MonthlyAttendance.findOneAndUpdate(
      { classId, academicYearId: targetAcademicYearId || null, monthKey },
      {
        $set: { totalClassesConducted, rows, updatedBy: userId || null, academicYearId: targetAcademicYearId || null },
        $setOnInsert: { classId, monthKey, createdBy: userId || null },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await AttendanceService._notifyMonthlyAttendanceSaved({
      rows,
      monthKey,
      totalClassesConducted,
    });

    return doc;
  }

  /**
   * Fetch the monthly entry doc for a class+month (for the entry UI to pre-fill).
   */
  static async getMonthlyClassEntry(classId, monthKey, academicYearId) {
    if (!classId) throw new AppError('classId is required', 400);

    // Resolve academicYearId
    if (!academicYearId) {
      try {
        const SetupService = require('../setup/service');
        academicYearId = await SetupService.resolveAcademicYearId(null);
      } catch { /* leave null */ }
    }

    const MonthlyAttendance = require('../../models/MonthlyAttendance');
    const query = { classId, academicYearId: academicYearId || null };
    if (monthKey) query.monthKey = monthKey;
    
    let doc = await MonthlyAttendance.findOne(query)
      .sort({ monthKey: -1 })
      .lean();

    if (!doc && monthKey) {
      // Fallback: search by classId and monthKey under any academicYearId
      doc = await MonthlyAttendance.findOne({ classId, monthKey })
        .sort({ monthKey: -1 })
        .lean();
    }

    return doc || null;
  }

  /**
   * Cumulative report for all students of a class across all recorded months.
   */
  static async getMonthlyClassReport(classId, academicYearId) {
    if (!classId) throw new AppError('classId is required', 400);

    // Resolve academicYearId
    if (!academicYearId) {
      try {
        const SetupService = require('../setup/service');
        academicYearId = await SetupService.resolveAcademicYearId(null);
      } catch { /* leave null */ }
    }

    const MonthlyAttendance = require('../../models/MonthlyAttendance');
    const Student = require('../../models/Student');

    const monthFilter = { classId, academicYearId: academicYearId || null };
    let months = await MonthlyAttendance.find(monthFilter).sort({ monthKey: 1 }).lean();
    if (!months || months.length === 0) {
      months = await MonthlyAttendance.find({ classId }).sort({ monthKey: 1 }).lean();
    }
    const totalConducted = months.reduce((s, m) => s + (m.totalClassesConducted || 0), 0);

    const students = await Student.find({ classId, isActive: { $ne: false } })
      .select('name rollNo')
      .sort({ rollNo: 1 })
      .lean();

    const map = {};
    for (const s of students) {
      map[s._id.toString()] = { _id: s._id, name: s.name, rollNo: s.rollNo, totalConducted, totalAttended: 0, monthWise: [] };
    }

    for (const m of months) {
      for (const row of (m.rows || [])) {
        const sid = row.studentId?.toString();
        if (sid && map[sid]) {
          map[sid].totalAttended += row.attendedClasses || 0;
          map[sid].monthWise.push({ monthKey: m.monthKey, conducted: m.totalClassesConducted, attended: row.attendedClasses || 0 });
        }
      }
    }

    const studentsList = Object.values(map).map(s => ({
      ...s,
      percentage: totalConducted > 0 ? Math.round((s.totalAttended / totalConducted) * 1000) / 10 : 0,
    }));

    return {
      students: studentsList,
      months: months.map(m => ({ monthKey: m.monthKey, totalConducted: m.totalClassesConducted })),
      totalConducted,
    };
  }

  /**
   * Per-student cumulative + month-wise report (for parent portal).
   */
  static async getMonthlyStudentReport(studentId) {
    if (!studentId) throw new AppError('studentId is required', 400);
    const MonthlyAttendance = require('../../models/MonthlyAttendance');
    const Student = require('../../models/Student');

    const student = await Student.findById(studentId).select('name rollNo classId').lean();
    if (!student) throw new AppError('Student not found', 404);

    const months = await MonthlyAttendance.find({ 'rows.studentId': new mongoose.Types.ObjectId(studentId) })
      .sort({ monthKey: 1 })
      .lean();

    let totalConducted = 0;
    let totalAttended = 0;
    const monthWise = [];

    for (const m of months) {
      const row = m.rows.find(r => r.studentId?.toString() === studentId.toString());
      const attended = row?.attendedClasses || 0;
      totalConducted += m.totalClassesConducted || 0;
      totalAttended += attended;
      monthWise.push({ monthKey: m.monthKey, conducted: m.totalClassesConducted, attended });
    }

    return {
      student,
      totalConducted,
      totalAttended,
      percentage: totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 1000) / 10 : 0,
      monthWise,
    };
  }

  static async _notifyMonthlyAttendanceSaved({ rows, monthKey, totalClassesConducted }) {
    try {
      const studentIds = [...new Set((rows || []).map((row) => row.studentId?.toString()).filter(Boolean))];
      if (!studentIds.length) return;

      const Parent = require('../../models/Parent');
      const NotificationService = require('../notification/service');
      const students = await Student.find({ _id: { $in: studentIds }, parentId: { $ne: null } })
        .select('name parentId')
        .lean();
      const parentIds = [...new Set(students.map((student) => student.parentId?.toString()).filter(Boolean))];
      if (!parentIds.length) return;

      const parents = await Parent.find({ _id: { $in: parentIds }, userId: { $ne: null } })
        .select('userId')
        .lean();
      const userIdsByParentId = new Map(parents.map((parent) => [parent._id.toString(), parent.userId]));

      const notifications = students
        .map((student) => {
          const parentUserId = userIdsByParentId.get(student.parentId?.toString());
          if (!parentUserId) return null;

          return NotificationService.create(parentUserId, {
            title: 'Monthly Attendance Updated',
            message: `${student.name}'s attendance for ${monthKey} has been updated.`,
            type: 'info',
            metadata: {
              module: 'attendance',
              studentId: student._id,
              monthKey,
              totalClassesConducted,
              url: '/parent/attendance',
            },
          });
        })
        .filter(Boolean);

      if (!notifications.length) return;
      const results = await Promise.allSettled(notifications);
      const sent = results.filter((item) => item.status === 'fulfilled').length;
      console.log(`[Attendance] Monthly attendance notifications created: ${sent}/${notifications.length}`);
    } catch (error) {
      console.error('[Attendance] Monthly attendance notification failed:', error.message);
    }
  }
}

module.exports = AttendanceService;
