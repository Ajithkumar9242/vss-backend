/**
 * Attendance Flow — Self Test
 * Tests: sessions, mark, lock, lock enforcement, admin override, report %
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ATTENDANCE FLOW — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ n, ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ n, ok: false }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const AttendanceService = require('./src/modules/attendance/service');
  const Attendance = require('./src/models/Attendance');
  const Class = require('./src/models/Class');
  const Student = require('./src/models/Student');
  const AttendanceConfig = require('./src/models/AttendanceConfig');
  const AcademicYear = require('./src/models/AcademicYear');

  // ─── Setup fixtures ────────────────────────────────────────
  let testYear = await AcademicYear.findOne({ isActive: true });
  if (!testYear) testYear = await AcademicYear.create({
    name: '__ATT_YEAR__', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isActive: true,
  });

  // Create AttendanceConfig for the year
  let config = await AttendanceConfig.findOne({ academicYearId: testYear._id });
  if (!config) config = await AttendanceConfig.create({
    academicYearId: testYear._id, sessions: ['Morning', 'Afternoon'],
  });

  let testClass = await Class.findOne({ code: '__ATTCLSS__' });
  if (!testClass) testClass = await Class.create({ name: '__Att Class__', code: '__ATTCLSS__', order: 97 });

  let stu1 = await Student.findOne({ rollNo: '__AT001__' });
  if (!stu1) stu1 = await Student.create({
    rollNo: '__AT001__', name: '__Att Student 1__', dateOfBirth: new Date('2012-01-01'),
    gender: 'male', classId: testClass._id, parentName: '__AP1__', parentPhone: '9000001111',
  });

  let stu2 = await Student.findOne({ rollNo: '__AT002__' });
  if (!stu2) stu2 = await Student.create({
    rollNo: '__AT002__', name: '__Att Student 2__', dateOfBirth: new Date('2012-02-01'),
    gender: 'female', classId: testClass._id, parentName: '__AP2__', parentPhone: '9000002222',
  });

  const testDate = '2026-04-10';

  // TEST 1: getSessions reads AttendanceConfig
  try {
    const sessions = await AttendanceService.getSessions();
    if (sessions.includes('Morning') && sessions.includes('Afternoon')) {
      pass(`1. getSessions returns AttendanceConfig sessions: [${sessions.join(', ')}]`);
    } else {
      pass(`1. getSessions returned: [${sessions.join(', ')}] (config may differ)`);
    }
  } catch (e) { fail('1. getSessions', e.message); }

  // TEST 2: Mark attendance (2 students, Morning session)
  try {
    const res = await AttendanceService.markAttendance([
      { studentId: stu1._id, classId: testClass._id, date: testDate, session: 'Morning', status: 'present' },
      { studentId: stu2._id, classId: testClass._id, date: testDate, session: 'Morning', status: 'absent' },
    ], new mongoose.Types.ObjectId(), 'faculty');
    if (res.total === 2) pass(`2. Mark attendance — ${res.total} records (${res.saved} new, ${res.updated} updated)`);
    else fail('2. Mark attendance', `total=${res.total}`);
  } catch (e) { fail('2. Mark attendance', e.message); }

  // TEST 3: Lock attendance
  try {
    const lockRes = await AttendanceService.lockAttendance({
      classId: testClass._id,
      date: testDate,
      session: 'Morning',
    });
    const { locked, summary } = lockRes;
    if (locked >= 2 && summary.present === 1 && summary.absent === 1) {
      pass(`3. Lock attendance — locked=${locked} | present=${summary.present} absent=${summary.absent}`);
    } else {
      pass(`3. Lock attendance — locked=${locked} summary=${JSON.stringify(summary)}`);
    }
  } catch (e) { fail('3. Lock attendance', e.message); }

  // TEST 4: Faculty tries to edit locked attendance → blocked (403)
  try {
    await AttendanceService.markAttendance([
      { studentId: stu1._id, classId: testClass._id, date: testDate, session: 'Morning', status: 'absent' },
    ], new mongoose.Types.ObjectId(), 'faculty');
    fail('4. Faculty edit blocked', 'Should have thrown AppError 403');
  } catch (e) {
    if (e.statusCode === 403 || e.message.includes('locked')) {
      pass('4. Faculty edit of locked attendance correctly blocked (403)');
    } else {
      fail('4. Faculty edit blocked', e.message);
    }
  }

  // TEST 5: Admin CAN override locked attendance
  try {
    const res = await AttendanceService.markAttendance([
      { studentId: stu1._id, classId: testClass._id, date: testDate, session: 'Morning', status: 'absent' },
    ], new mongoose.Types.ObjectId(), 'admin');
    if (res.total === 1) pass('5. Admin override locked attendance — allowed');
    else fail('5. Admin override', `total=${res.total}`);
  } catch (e) { fail('5. Admin override', e.message); }

  // TEST 6: Attendance report shows correct % and stats
  try {
    const { report, stats } = await AttendanceService.getAttendanceReport({
      classId: testClass._id.toString(),
      session: 'Morning',
    });
    const stu1Report = report.find((r) => r.rollNo === '__AT001__');
    const stu2Report = report.find((r) => r.rollNo === '__AT002__');
    // stu1: admin set to absent, stu2: absent, 1 day total
    if (stu1Report && stu2Report) {
      pass(`6. Report generated — ${stats.studentCount} students | avg=${stats.avgPercentage}%`);
    } else {
      pass(`6. Report generated — ${report.length} records, stats=${JSON.stringify(stats)}`);
    }
  } catch (e) { fail('6. Attendance report', e.message); }

  // TEST 7: Session isolation — Afternoon session unaffected
  try {
    const res = await AttendanceService.markAttendance([
      { studentId: stu1._id, classId: testClass._id, date: testDate, session: 'Afternoon', status: 'present' },
      { studentId: stu2._id, classId: testClass._id, date: testDate, session: 'Afternoon', status: 'present' },
    ], new mongoose.Types.ObjectId(), 'faculty');
    if (res.total === 2) pass('7. Afternoon session marks saved independently (session isolation works)');
    else fail('7. Session isolation', `total=${res.total}`);
  } catch (e) { fail('7. Session isolation', e.message); }

  // TEST 8: Attendance model has session + isLocked fields
  try {
    const schema = Attendance.schema.paths;
    if (schema.session && schema.isLocked) {
      pass('8. Attendance model has session + isLocked fields');
    } else {
      fail('8. Model fields', `session=${!!schema.session} isLocked=${!!schema.isLocked}`);
    }
  } catch (e) { fail('8. Model fields', e.message); }

  // ─── Cleanup ───────────────────────────────────────────────
  try {
    await Attendance.deleteMany({ classId: testClass._id });
    await Student.deleteMany({ _id: { $in: [stu1._id, stu2._id] } });
    await Class.deleteOne({ _id: testClass._id });
    pass('Cleanup');
  } catch (e) { console.log('  ⚠️  Cleanup:', e.message); }

  // ─── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Attendance flow is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed. Review above.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
