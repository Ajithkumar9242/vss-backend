/**
 * selftest_integration.js
 *
 * Integration tests for ClassGroups, AttendanceConfig, and Fees overdue.
 * Run with:  node selftest_integration.js
 *
 * Tests:
 *  1. ClassGroup: Assign valid faculty as teacher → PASS
 *  2. ClassGroup: Assign non-faculty user → FAIL
 *  3. AttendanceConfig: Duplicate session names → FAIL
 *  4. AttendanceConfig: Valid preset (FULL_DAY) → PASS
 *  5. AttendanceConfig: max sessions exceeded → FAIL
 *  6. Fees: Overdue status computed correctly → PASS
 *  7. Fees: Payment updates installment → PASS
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ClassGroup       = require('./src/models/ClassGroup');
const AttendanceConfig = require('./src/models/AttendanceConfig');
const FeeStructure     = require('./src/models/FeeStructure');
const FeeInvoice       = require('./src/models/FeeInvoice');
const FeePayment       = require('./src/models/FeePayment');
const AcademicYear     = require('./src/models/AcademicYear');
const Class            = require('./src/models/Class');
const Section          = require('./src/models/Section');
const Faculty          = require('./src/models/Faculty');
const User             = require('./src/models/User');
const Student          = require('./src/models/Student');

const SetupService = require('./src/modules/setup/service');
const FeesService  = require('./src/modules/fees/service');

// ─── Helpers ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const P = 'INTTEST_';

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function cleanup() {
  // Clean up Users first (has unique index on email)
  await User.deleteMany({ email: new RegExp(`^${P}`, 'i') });
  await Faculty.deleteMany({ email: new RegExp(`^${P}`, 'i') });

  const cls  = await Class.findOne({ code: `${P}CLS` });
  const year = await AcademicYear.findOne({ name: `${P}Year` });
  const sec  = cls ? await Section.findOne({ classId: cls._id }) : null;

  if (cls && sec) await ClassGroup.deleteMany({ classId: cls._id });
  if (year)       await AttendanceConfig.deleteMany({ academicYearId: year._id });
  if (cls && year) {
    await FeeStructure.deleteMany({ classId: cls._id });
    await FeeInvoice.deleteMany({ classId: cls._id });
  }

  const students = await Student.find({ name: new RegExp(`^${P}`) });
  for (const s of students) {
    await FeePayment.deleteMany({ studentId: s._id });
    await FeeInvoice.deleteMany({ studentId: s._id });
  }
  await Student.deleteMany({ name: new RegExp(`^${P}`) });
  if (sec)  await Section.deleteOne({ _id: sec._id });
  if (cls)  await Class.deleteOne({ _id: cls._id });
  if (year) await AcademicYear.deleteOne({ _id: year._id });
}

// ─── Main ────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪  Integration Test — ClassGroups + AttendanceConfig + Fees\n');

  await mongoose.connect(process.env.MONGODB_URI);
  await cleanup();

  // ── Fixtures ──────────────────────────────────────────────
  const classDoc = await Class.create({ name: `${P}Class`, code: `${P}CLS` });
  const sectionDoc = await Section.create({ name: 'A', classId: classDoc._id });
  const yearDoc = await AcademicYear.create({
    name: `${P}Year`, startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'), isActive: false,
  });

  // Faculty user
  const facultyUser = await User.create({
    name: `${P}Faculty`, email: `${P}faculty@test.com`,
    password: 'Test@123', role: 'faculty',
  });
  const facultyDoc = await Faculty.create({
    name: `${P}Faculty`, email: `${P}faculty@test.com`,
    employeeId: `${P}EMP001`, userId: facultyUser._id,
  });

  // Non-faculty user
  const adminUser = await User.create({
    name: `${P}Admin`, email: `${P}admin@test.com`,
    password: 'Test@123', role: 'admin',
  });
  const adminFaculty = await Faculty.create({
    name: `${P}Admin`, email: `${P}admin@test.com`,
    employeeId: `${P}ADM001`, userId: adminUser._id,
  });

  // ─────────────────────────────────────────────────────────
  // Test 1 — ClassGroup: Assign valid faculty → PASS
  // ─────────────────────────────────────────────────────────
  await test('1. ClassGroup: Assign valid faculty as teacher → PASS', async () => {
    const group = await SetupService.createClassGroup({
      name:      `${P}5A`,
      classId:   classDoc._id.toString(),
      sectionId: sectionDoc._id.toString(),
      teacherId: facultyDoc._id.toString(),
    });

    assert(group._id, 'No _id');
    const teacher = group.classTeacherId || group.teacherId;
    assert(teacher, 'classTeacherId not saved');

    // Verify via getClassGroups
    const list = await SetupService.getClassGroups({});
    const found = list.find((g) => g._id.toString() === group._id.toString());
    assert(found, 'Group not found in list');
    const t = found.teacherId || found.classTeacherId;
    assert(t, 'Teacher not populated in list');
  });

  // ─────────────────────────────────────────────────────────
  // Test 2 — ClassGroup: Assign non-faculty (admin role linked) → FAIL
  // ─────────────────────────────────────────────────────────
  await test('2. ClassGroup: Assign non-faculty user → FAIL', async () => {
    // adminFaculty is linked to adminUser who has role 'admin'
    // The service allows admin/super_admin too for flexibility, so we test with a
    // plain Student user which is definitely not faculty
    const studentUser = await User.create({
      name: `${P}Student`, email: `${P}student@test.com`,
      password: 'Test@123', role: 'student',
    });
    const notFaculty = await Faculty.create({
      name: `${P}Student`, email: `${P}student@test.com`,
      employeeId: `${P}STU001`, userId: studentUser._id,
    });

    let threw = false;
    try {
      await SetupService.createClassGroup({
        name:      `${P}5B`,
        classId:   classDoc._id.toString(),
        sectionId: sectionDoc._id.toString(),
        teacherId: notFaculty._id.toString(),
      });
    } catch (e) {
      threw = true;
      assert(
        e.message.toLowerCase().includes('faculty') || e.message.toLowerCase().includes('role'),
        `Expected role/faculty error, got: ${e.message}`
      );
    }

    // Cleanup extra records
    await Faculty.deleteOne({ _id: notFaculty._id });
    await User.deleteOne({ _id: studentUser._id });

    assert(threw, 'Should have thrown for non-faculty teacher');
  });

  // ─────────────────────────────────────────────────────────
  // Test 3 — AttendanceConfig: Duplicate session names → FAIL
  // ─────────────────────────────────────────────────────────
  await test('3. AttendanceConfig: Duplicate session names → FAIL', async () => {
    let threw = false;
    try {
      await SetupService.upsertAttendanceConfig({
        academicYearId: yearDoc._id.toString(),
        mode: 'session',
        sessions: [
          { name: 'Morning', order: 1 },
          { name: 'Morning', order: 2 },  // duplicate!
        ],
      });
    } catch (e) {
      threw = true;
      assert(
        e.message.toLowerCase().includes('unique') || e.message.toLowerCase().includes('duplicate'),
        `Expected duplicate error, got: ${e.message}`
      );
    }
    assert(threw, 'Should have thrown for duplicate session names');
  });

  // ─────────────────────────────────────────────────────────
  // Test 4 — AttendanceConfig: Valid preset FULL_DAY → PASS
  // ─────────────────────────────────────────────────────────
  await test('4. AttendanceConfig: Valid preset (FULL_DAY) → PASS', async () => {
    const config = await SetupService.upsertAttendanceConfig({
      academicYearId: yearDoc._id.toString(),
      preset: 'FULL_DAY',
    });

    assert(config._id, 'No _id');
    assert(config.sessions.length === 2, `Expected 2 sessions, got ${config.sessions.length}`);
    assert(config.sessions[0].name === 'Morning',   'First session should be Morning');
    assert(config.sessions[1].name === 'Afternoon', 'Second session should be Afternoon');
    assert(config.sessions[0].startTime === '09:00', 'Morning should start at 09:00');

    console.log(`       → Sessions: ${config.sessions.map((s) => s.name).join(', ')}`);
  });

  // ─────────────────────────────────────────────────────────
  // Test 5 — AttendanceConfig: Max sessions exceeded → FAIL
  // ─────────────────────────────────────────────────────────
  await test('5. AttendanceConfig: More than 10 sessions → FAIL', async () => {
    let threw = false;
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      name: `Session ${i + 1}`, order: i + 1,
    }));

    try {
      await SetupService.upsertAttendanceConfig({
        academicYearId: yearDoc._id.toString(),
        sessions: tooMany,
      });
    } catch (e) {
      threw = true;
      assert(
        e.message.toLowerCase().includes('maximum') || e.message.includes('10'),
        `Expected max error, got: ${e.message}`
      );
    }
    assert(threw, 'Should have thrown for > 10 sessions');
  });

  // ─────────────────────────────────────────────────────────
  // Test 6 — Fees: Overdue status computed correctly → PASS
  // ─────────────────────────────────────────────────────────
  await test('6. Fees: Overdue status computed → PASS', async () => {
    // Create structure with a past-due installment
    const pastDate = new Date('2025-01-01');  // definitely in the past
    const futureDate = new Date('2027-06-01');

    const structure = await FeeStructure.create({
      classId:       classDoc._id,
      academicYearId: yearDoc._id,
      totalAmount:   20000,
      installments: [
        { name: 'Term 1', amount: 10000, dueDate: pastDate,   status: 'pending', paidAmount: 0 },
        { name: 'Term 2', amount: 10000, dueDate: futureDate, status: 'pending', paidAmount: 0 },
      ],
    });

    // Create student + invoice
    const studentDoc = await Student.create({
      name: `${P}OvStudent`, rollNo: `${P}OV001`,
      classId: classDoc._id, academicYearId: yearDoc._id,
      gender: 'female', dateOfBirth: new Date('2010-01-01'),
      parentName: `${P}Parent`, parentPhone: '9000000001',
    });

    await FeeInvoice.create({
      studentId: studentDoc._id, classId: classDoc._id,
      academicYearId: yearDoc._id, feeStructureId: structure._id,
      totalAmount: 20000, paidAmount: 0, dueAmount: 20000, status: 'unpaid',
    });

    // Make yearDoc the active year temporarily, then compute via getStudentFees
    await AcademicYear.findByIdAndUpdate(yearDoc._id, { isActive: true });

    const result = await FeesService.getStudentFees(studentDoc._id.toString());

    await AcademicYear.findByIdAndUpdate(yearDoc._id, { isActive: false });

    assert(Array.isArray(result.installments), 'installments must be array');
    assert(result.installments.length === 2, `Expected 2, got ${result.installments.length}`);

    const pastInst = result.installments[0];
    assert(
      pastInst.overdue === true,
      `Past installment should be overdue, got overdue=${pastInst.overdue}, status=${pastInst.status}`
    );

    const futureInst = result.installments[1];
    assert(
      futureInst.overdue === false,
      `Future installment should NOT be overdue, got overdue=${futureInst.overdue}`
    );

    console.log(`       → inst[0]: ${pastInst.name}, overdue=${pastInst.overdue}`);
    console.log(`       → inst[1]: ${futureInst.name}, overdue=${futureInst.overdue}`);
  });

  // ─────────────────────────────────────────────────────────
  // Test 7 — Fees: Payment updates installment → PASS
  // ─────────────────────────────────────────────────────────
  await test('7. Fees: Payment updates installment status → PASS', async () => {
    // Find the student from test 6
    const studentDoc = await Student.findOne({ name: `${P}OvStudent` });
    assert(studentDoc, 'Student from test 6 not found');

    await AcademicYear.findByIdAndUpdate(yearDoc._id, { isActive: true });

    await FeesService.recordPayment({
      studentId: studentDoc._id.toString(),
      amount: 10000,
      paymentMode: 'cash',
    });

    await AcademicYear.findByIdAndUpdate(yearDoc._id, { isActive: false });

    // Check installment updated
    const structure = await FeeStructure.findOne({ classId: classDoc._id });
    const firstInst = structure.installments[0];
    assert(firstInst.paidAmount === 10000, `paidAmount should be 10000, got ${firstInst.paidAmount}`);
    assert(firstInst.status === 'paid', `status should be 'paid', got '${firstInst.status}'`);

    console.log(`       → 1st installment: paidAmount=₹${firstInst.paidAmount}, status=${firstInst.status}`);
  });

  // ── Cleanup ──────────────────────────────────────────────
  await cleanup();

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉  All integration tests passed!');
  } else {
    console.log('  ⚠️   Some tests failed — check output above.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
})();
