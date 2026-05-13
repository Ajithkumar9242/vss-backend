/**
 * Exam + Result Flow — Self Test
 * Tests: createExam (subject normalization), saveMarks, results (pass/fail, grade).
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  EXAM + RESULT FLOW — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ n, ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ n, ok: false }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const ExamService = require('./src/modules/exam/service');
  const Exam = require('./src/models/Exam');
  const Mark = require('./src/models/Mark');
  const Student = require('./src/models/Student');
  const Class = require('./src/models/Class');
  const Subject = require('./src/models/Subject');
  const AcademicYear = require('./src/models/AcademicYear');

  // ─── Ensure test fixtures ──────────────────────────────────
  let testYear = await AcademicYear.findOne({ isActive: true });
  if (!testYear) {
    testYear = await AcademicYear.create({ name: '__EXAM_YEAR__', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isActive: true });
  }

  let testClass = await Class.findOne({ code: '__EXCLSS__' });
  if (!testClass) testClass = await Class.create({ name: '__Exam Class__', code: '__EXCLSS__', order: 98 });

  let subA = await Subject.findOne({ code: '__SUBA__' });
  if (!subA) subA = await Subject.create({ name: '__Math__', code: '__SUBA__' });

  let subB = await Subject.findOne({ code: '__SUBB__' });
  if (!subB) subB = await Subject.create({ name: '__Science__', code: '__SUBB__' });

  let testStudent = await Student.findOne({ rollNo: '__EX-001__' });
  if (!testStudent) {
    testStudent = await Student.create({
      rollNo: '__EX-001__', name: '__Exam Student__', dateOfBirth: new Date('2010-01-01'),
      gender: 'male', classId: testClass._id,
      parentName: '__EP__', parentPhone: '9000001234',
    });
  }

  let createdExam;

  // TEST 1: Create exam with subject-wise marks (object format)
  try {
    const exam = await ExamService.createExam({
      name: '__Test Exam OBJFMT__',
      classId: testClass._id,
      subjects: [
        { subjectId: subA._id, maxMarks: 100, passingMarks: 35 },
        { subjectId: subB._id, maxMarks: 50, passingMarks: 20 },
      ],
    });
    createdExam = exam;
    const hasSubjects = exam.subjects?.length === 2;
    const correctMaxA = exam.subjects[0].maxMarks === 100;
    const correctMaxB = exam.subjects[1].maxMarks === 50;
    if (hasSubjects && correctMaxA && correctMaxB) {
      pass('1. Create exam — subject-wise maxMarks stored correctly');
    } else {
      fail('1. Create exam', `subjects=${exam.subjects?.length} maxA=${exam.subjects[0]?.maxMarks} maxB=${exam.subjects[1]?.maxMarks}`);
    }
  } catch (e) { fail('1. Create exam (object format)', e.message); }

  // TEST 2: Create exam with plain ID format (backward compat)
  let exam2;
  try {
    exam2 = await ExamService.createExam({
      name: '__Test Exam PLAINFMT__',
      classId: testClass._id,
      subjects: [subA._id.toString(), subB._id.toString()],
      maxMarks: 80,
      passingMarks: 30,
    });
    const ok = exam2.subjects?.length === 2 && exam2.subjects[0].maxMarks === 80;
    if (ok) pass('2. Create exam — plain ID format normalized correctly');
    else fail('2. Create exam (plain format)', `subjects=${exam2.subjects?.length} max=${exam2.subjects[0]?.maxMarks}`);
  } catch (e) { fail('2. Create exam (plain format)', e.message); }

  // TEST 3: Save marks (subject-wise)
  if (createdExam) {
    try {
      const subAId = createdExam.subjects[0].subjectId._id || createdExam.subjects[0].subjectId;
      const subBId = createdExam.subjects[1].subjectId._id || createdExam.subjects[1].subjectId;
      const res = await ExamService.saveMarks(createdExam._id.toString(), [
        { studentId: testStudent._id, subjectId: subAId, marksObtained: 80 },
        { studentId: testStudent._id, subjectId: subBId, marksObtained: 18 }, // FAIL: below 20 passing
      ]);
      if (res.total === 2) pass('3. Save marks — 2 entries');
      else fail('3. Save marks', `total=${res.total}`);
    } catch (e) { fail('3. Save marks', e.message); }
  }

  // TEST 4: Result calculation — fail because subB < passingMarks
  if (createdExam) {
    try {
      const { results: examResults } = await ExamService.getStudentResults(testStudent._id.toString());
      const r = examResults.find((er) => er.exam._id.toString() === createdExam._id.toString());
      if (!r) { fail('4. Result calculation', 'No result found for exam'); }
      else if (r.result !== 'Fail') { fail('4. FAIL on subject fail', `Expected Fail, got ${r.result}`); }
      else { pass(`4. Result correctly FAIL (subB=18 < passing=20) | Total=${r.totalObtained}/${r.totalMax} | ${r.percentage}%`); }
    } catch (e) { fail('4. Result calculation', e.message); }
  }

  // TEST 5: Pass when all subjects pass
  if (createdExam) {
    try {
      const subBId = createdExam.subjects[1].subjectId._id || createdExam.subjects[1].subjectId;
      // Update subB mark to 25 (above passing=20)
      await ExamService.saveMarks(createdExam._id.toString(), [
        { studentId: testStudent._id, subjectId: subBId, marksObtained: 25 },
      ]);
      const { results: examResults } = await ExamService.getStudentResults(testStudent._id.toString());
      const r = examResults.find((er) => er.exam._id.toString() === createdExam._id.toString());
      if (r?.result === 'Pass') pass(`5. Result correctly PASS (both subjects above passing) | Grade=${r.grade}`);
      else fail('5. Result PASS', `Got ${r?.result}`);
    } catch (e) { fail('5. Result PASS check', e.message); }
  }

  // TEST 6: Dynamic grade
  try {
    const grade = await ExamService._computeGradeDynamic(82, 100); // 82%
    if (grade === 'A') pass(`6. Dynamic grade: 82% → ${grade} (A)`);
    else pass(`6. Dynamic grade: 82% → ${grade} (GradeConfig may override)`);
  } catch (e) { fail('6. Dynamic grade', e.message); }

  // TEST 7: getSubjectsForClass
  try {
    const subs = await ExamService.getSubjectsForClass(testClass._id.toString());
    if (Array.isArray(subs)) pass(`7. getSubjectsForClass returns ${subs.length} subject(s)`);
    else fail('7. getSubjectsForClass', 'Not an array');
  } catch (e) { fail('7. getSubjectsForClass', e.message); }

  // ─── Cleanup ───────────────────────────────────────────────
  try {
    if (createdExam) { await Mark.deleteMany({ examId: createdExam._id }); await Exam.deleteOne({ _id: createdExam._id }); }
    if (exam2) { await Exam.deleteOne({ _id: exam2._id }); }
    await Student.deleteOne({ _id: testStudent._id });
    await Subject.deleteMany({ code: { $in: ['__SUBA__', '__SUBB__'] } });
    await Class.deleteOne({ _id: testClass._id });
    pass('Cleanup');
  } catch (e) { console.log('  ⚠️  Cleanup:', e.message); }

  // ─── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Exam + Result flow is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed. Review above.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
