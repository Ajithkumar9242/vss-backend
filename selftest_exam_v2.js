/**
 * selftest_exam_v2.js — Simplified Exam Module Tests
 * Run:  node selftest_exam_v2.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Exam    = require('./src/models/Exam');
const Mark    = require('./src/models/Mark');
const Student = require('./src/models/Student');
const Class   = require('./src/models/Class');
const Subject = require('./src/models/Subject');
const AcademicYear = require('./src/models/AcademicYear');
const ExamService  = require('./src/modules/exam/service');

const P = 'EV2TEST_';
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (e) { console.error(`  ❌  ${name}\n       ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

async function cleanup() {
  const cls = await Class.findOne({ code: `${P}CLS` });
  if (cls) {
    const exams = await Exam.find({ classId: cls._id });
    for (const e of exams) await Mark.deleteMany({ examId: e._id });
    await Exam.deleteMany({ classId: cls._id });
    await Student.deleteMany({ classId: cls._id });
    await Class.deleteOne({ _id: cls._id });
  }
  await Subject.deleteMany({ code: new RegExp(`^${P}`) });
  await AcademicYear.deleteOne({ name: `${P}Year` });
}

(async () => {
  console.log('\n🧪  Exam Module v2 Self Test\n');
  await mongoose.connect(process.env.MONGODB_URI);
  await cleanup();

  // ── Fixtures ──────────────────────────────────────────────
  const classDoc = await Class.create({ name: `${P}Class10`, code: `${P}CLS` });
  // isActive=false, academicYearId not required for exam creation (resolves to null if no active year)
  const yearDoc  = await AcademicYear.create({
    name: `${P}Year`, startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'), isActive: false,  // not active → no ClassConfig conflict
  });
  const sub1 = await Subject.create({ name: `${P}Math`,    code: `${P}MATH`, type: 'theory' });
  const sub2 = await Subject.create({ name: `${P}Science`, code: `${P}SCI`,  type: 'theory' });

  const student = await Student.create({
    name: `${P}Student`, rollNo: `${P}001`,
    classId: classDoc._id, academicYearId: yearDoc._id,
    gender: 'male', dateOfBirth: new Date('2010-01-01'),
    parentName: `${P}Parent`, parentPhone: '9000009999',
  });

  let examId;

  // ─────────────────────────────────────────────────────────
  await test('1. Create exam with flat subjects[] → PASS', async () => {
    const exam = await ExamService.createExam({
      examName: `${P}MidTerm`,
      classId:  classDoc._id.toString(),
      maxMarks: 100, passingMarks: 35,
      subjects: [sub1._id.toString(), sub2._id.toString()],
      examDate: new Date('2026-09-15'),
    });
    assert(exam._id, 'No _id');
    assert(exam.maxMarks === 100, `maxMarks should be 100, got ${exam.maxMarks}`);
    assert(exam.subjects?.length === 2, `Expected 2 subjects, got ${exam.subjects?.length}`);
    examId = exam._id.toString();
    console.log(`       → examId: ${examId}, subjects: ${exam.subjects.length}`);
  });

  // ─────────────────────────────────────────────────────────
  await test('2. examName alias stored as name → PASS', async () => {
    const exam = await ExamService.createExam({
      examName: `${P}FinalExam`, classId: classDoc._id.toString(), maxMarks: 50,
    });
    assert(exam.name === `${P}FinalExam` || exam.examName === `${P}FinalExam`,
      `Expected '${P}FinalExam', got name='${exam.name}'`);
  });

  // ─────────────────────────────────────────────────────────
  await test('3. Duplicate exam name → FAIL (unique index)', async () => {
    let threw = false;
    try {
      await ExamService.createExam({ examName: `${P}MidTerm`, classId: classDoc._id.toString(), maxMarks: 100 });
    } catch (e) { threw = true; }
    assert(threw, 'Should throw for duplicate exam name');
  });

  // ─────────────────────────────────────────────────────────
  await test('4. marksObtained > maxMarks → FAIL', async () => {
    let threw = false;
    try {
      await ExamService.saveMarks(examId, [
        { studentId: student._id.toString(), subjectId: sub1._id.toString(), marksObtained: 150 },
      ]);
    } catch (e) {
      threw = true;
      assert(e.message.includes('maxMarks') || e.message.includes('150'),
        `Expected maxMarks error, got: ${e.message}`);
    }
    assert(threw, 'Should throw for marksObtained > maxMarks');
  });

  // ─────────────────────────────────────────────────────────
  await test('5. Save marks + pass/fail flag → PASS', async () => {
    const result = await ExamService.saveMarks(examId, [
      { studentId: student._id.toString(), subjectId: sub1._id.toString(), marksObtained: 80 },
      { studentId: student._id.toString(), subjectId: sub2._id.toString(), marksObtained: 20 },
    ]);
    assert(result.total === 2, `Expected 2 marks, got ${result.total}`);

    const mark2 = await Mark.findOne({ examId: new mongoose.Types.ObjectId(examId), subjectId: sub2._id });
    assert(mark2?.passed === false, `sub2 passed should be false, got ${mark2?.passed}`);
    assert(mark2?.marksObtained === 20, `sub2 marks should be 20, got ${mark2?.marksObtained}`);
    console.log(`       → sub1=80✅ sub2=20❌ (passing=35)`);
  });

  // ─────────────────────────────────────────────────────────
  await test('6. Student results: percentage, grade, pass/fail → PASS', async () => {
    const { student: s, results } = await ExamService.getStudentResults(student._id.toString());
    assert(results.length >= 1, `Expected >=1 result, got ${results.length}`);

    const r = results.find((x) => x.exam._id.toString() === examId);
    assert(r, 'MidTerm result not found');
    assert(r.percentage === 50,  `Expected 50%, got ${r.percentage}%`);
    assert(r.result === 'Fail',  `Expected Fail (sub2<35), got '${r.result}'`);
    assert(r.totalObtained === 100, `totalObtained=100 expected, got ${r.totalObtained}`);
    assert(r.subjects.length === 2, `Expected 2 subjects in result, got ${r.subjects.length}`);

    const failSub = r.subjects.find((x) => x.marksObtained === 20);
    assert(failSub?.passed === false, 'Failed subject should have passed=false');
    console.log(`       → ${r.totalObtained}/${r.totalMax} = ${r.percentage}%, Grade=${r.grade}, ${r.result}`);
  });

  // ── Cleanup ──────────────────────────────────────────────
  await cleanup();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? '  🎉  All Exam module tests passed!' : '  ⚠️   Some tests failed.');
  if (failed) process.exitCode = 1;
  await mongoose.disconnect();
})();
