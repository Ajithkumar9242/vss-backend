/**
 * selftest_fee.js
 *
 * Integration test for the upgraded Fee Module.
 * Run with:  node selftest_fee.js
 *
 * Tests:
 *  1. Create FeeStructure with manual installments → PASS
 *  2. Create FeeStructure with auto split         → PASS
 *  3. Installment sum mismatch                    → FAIL
 *  4. Payment updates installment status          → PASS
 *  5. Overpayment                                 → FAIL
 *  6. Fetch student fees with installment breakdown → PASS
 */

require('dotenv').config();
const mongoose = require('mongoose');

const FeeStructure = require('./src/models/FeeStructure');
const FeeInvoice   = require('./src/models/FeeInvoice');
const FeePayment   = require('./src/models/FeePayment');
const FeeGroup     = require('./src/models/FeeGroup');
const Class        = require('./src/models/Class');
const AcademicYear = require('./src/models/AcademicYear');
const Student      = require('./src/models/Student');
const FeesService  = require('./src/modules/fees/service');

// ─── Helpers ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const PREFIX = 'FEETEST_';

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function cleanup() {
  const cls  = await Class.findOne({ code: `${PREFIX}CLS` });
  const year = await AcademicYear.findOne({ name: `${PREFIX}Year` });
  const grp  = await FeeGroup.findOne({ name: `${PREFIX}Group` });

  if (cls)  await FeeStructure.deleteMany({ classId: cls._id });
  if (cls && year) await FeeInvoice.deleteMany({ classId: cls._id });

  const students = await Student.find({ name: new RegExp(`^${PREFIX}`) });
  for (const s of students) {
    await FeePayment.deleteMany({ studentId: s._id });
    await FeeInvoice.deleteMany({ studentId: s._id });
  }
  await Student.deleteMany({ name: new RegExp(`^${PREFIX}`) });
  if (cls)  await Class.deleteOne({ _id: cls._id });
  if (year) await AcademicYear.deleteOne({ _id: year._id });
  if (grp)  await FeeGroup.deleteOne({ _id: grp._id });
}

// ─── Main ─────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪  Fee Module — Full ERP Self Test\n');

  await mongoose.connect(process.env.MONGODB_URI);
  await cleanup();

  // ── Shared state ─────────────────────────────────────────────
  let classDoc, yearDoc, feeGroupDoc, structureDoc, studentDoc, invoiceDoc;

  // ─────────────────────────────────────────────────────────────
  // Setup fixtures
  // ─────────────────────────────────────────────────────────────
  classDoc = await Class.create({ name: `${PREFIX}Class`, code: `${PREFIX}CLS` });
  yearDoc  = await AcademicYear.create({
    name: `${PREFIX}Year`, startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'), isActive: false,
  });
  feeGroupDoc = await FeeGroup.create({ name: `${PREFIX}Group`, description: 'Test' });

  // ─────────────────────────────────────────────────────────────
  // Test 1 — Create FeeStructure with manual installments → PASS
  // ─────────────────────────────────────────────────────────────
  await test('1. Create FeeStructure with manual installments → PASS', async () => {
    const due1 = new Date('2026-06-01');
    const due2 = new Date('2026-09-01');
    const due3 = new Date('2026-12-01');

    structureDoc = await FeesService.createStructure({
      classId:       classDoc._id.toString(),
      academicYearId: yearDoc._id.toString(),
      totalAmount:   30000,
      feeGroupId:    feeGroupDoc._id.toString(),
      installments: [
        { name: 'Term 1', amount: 10000, dueDate: due1 },
        { name: 'Term 2', amount: 10000, dueDate: due2 },
        { name: 'Term 3', amount: 10000, dueDate: due3 },
      ],
    });

    assert(structureDoc._id, 'No _id');
    assert(structureDoc.installments.length === 3, `Expected 3 installments, got ${structureDoc.installments.length}`);
    assert(structureDoc.installments[0].status === 'pending', 'First installment should be pending');
    assert(structureDoc.feeGroupId?.name === `${PREFIX}Group`, 'FeeGroup not populated');
  });

  // ─────────────────────────────────────────────────────────────
  // Test 2 — Create FeeStructure with auto split → PASS
  // ─────────────────────────────────────────────────────────────
  await test('2. Create FeeStructure with auto split → PASS', async () => {
    // Create a second class for this test
    const cls2 = await Class.create({ name: `${PREFIX}Class2`, code: `${PREFIX}CL2` });

    try {
      const result = await FeesService.createStructure({
        classId:          cls2._id.toString(),
        academicYearId:   yearDoc._id.toString(),
        totalAmount:      30000,
        installmentCount: 3,
        startDate:        '2026-06-01',
        frequency:        'monthly',
      });

      assert(result.installments.length === 3, `Expected 3 auto-split installments, got ${result.installments.length}`);

      const sum = result.installments.reduce((s, i) => s + i.amount, 0);
      assert(Math.abs(sum - 30000) <= 1, `Auto-split sum ${sum} != 30000`);
      assert(result.installments[0].name.includes('1st'), `Expected '1st Installment', got: ${result.installments[0].name}`);

      // Verify monthly spacing
      const d0 = new Date(result.installments[0].dueDate);
      const d1 = new Date(result.installments[1].dueDate);
      assert(d1.getMonth() === (d0.getMonth() + 1) % 12, 'Installments not monthly spaced');
    } finally {
      await FeeStructure.deleteOne({ classId: cls2._id });
      await Class.deleteOne({ _id: cls2._id });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Test 3 — Installment sum mismatch → FAIL
  // ─────────────────────────────────────────────────────────────
  await test('3. Installment sum mismatch → FAIL', async () => {
    const cls3 = await Class.create({ name: `${PREFIX}Class3`, code: `${PREFIX}CL3` });

    let threw = false;
    try {
      await FeesService.createStructure({
        classId:       cls3._id.toString(),
        academicYearId: yearDoc._id.toString(),
        totalAmount:   30000,
        installments: [
          { name: 'T1', amount: 10000, dueDate: new Date('2026-06-01') },
          { name: 'T2', amount: 15000, dueDate: new Date('2026-09-01') }, // sum = 25000 ≠ 30000
        ],
      });
    } catch (e) {
      threw = true;
      assert(
        e.message.toLowerCase().includes('installment') || e.message.includes('25000') || e.message.includes('equal'),
        `Unexpected error: ${e.message}`
      );
    } finally {
      await FeeStructure.deleteMany({ classId: cls3._id });
      await Class.deleteOne({ _id: cls3._id });
    }
    assert(threw, 'Should have thrown for sum mismatch');
  });

  // ─────────────────────────────────────────────────────────────
  // Test 4 — Payment updates installment status → PASS
  // ─────────────────────────────────────────────────────────────
  await test('4. Payment updates installment status → PASS', async () => {
    assert(classDoc && yearDoc && structureDoc, 'Prerequisites missing');

    // Create a student and invoice
    studentDoc = await Student.create({
      name:           `${PREFIX}Student`,
      rollNo:         `${PREFIX}001`,
      classId:        classDoc._id,
      academicYearId: yearDoc._id,
      gender:         'male',
      dateOfBirth:    new Date('2010-01-01'),
      parentName:     `${PREFIX}Parent`,
      parentPhone:    '9000000000',
    });

    invoiceDoc = await FeeInvoice.create({
      studentId: studentDoc._id,
      classId:   classDoc._id,
      academicYearId: yearDoc._id,
      feeStructureId: structureDoc._id,
      totalAmount: 30000,
      paidAmount:  0,
      dueAmount:   30000,
      status:      'unpaid',
    });

    // Pay exactly 10000 (first installment)
    await FeesService.recordPayment({
      studentId:   studentDoc._id.toString(),
      amount:      10000,
      paymentMode: 'cash',
    });

    // Check installment status updated
    const updated = await FeeStructure.findById(structureDoc._id);
    const firstInst = updated.installments[0];
    assert(firstInst.status === 'paid', `First installment should be 'paid', got '${firstInst.status}'`);
    assert(firstInst.paidAmount === 10000, `First installment paidAmount should be 10000, got ${firstInst.paidAmount}`);

    const secondInst = updated.installments[1];
    assert(secondInst.status === 'pending', `Second installment should still be 'pending', got '${secondInst.status}'`);
  });

  // ─────────────────────────────────────────────────────────────
  // Test 5 — Overpayment → FAIL
  // ─────────────────────────────────────────────────────────────
  await test('5. Overpayment → FAIL', async () => {
    assert(studentDoc && invoiceDoc, 'Prerequisites missing (test 4 must pass)');

    // Refresh invoice — dueAmount should now be 20000
    const inv = await FeeInvoice.findById(invoiceDoc._id);
    const dueAmount = inv.dueAmount;

    let threw = false;
    try {
      await FeesService.recordPayment({
        studentId:   studentDoc._id.toString(),
        amount:      dueAmount + 1,  // overpay by ₹1
        paymentMode: 'cash',
      });
    } catch (e) {
      threw = true;
      assert(
        e.message.toLowerCase().includes('overpay') || e.message.toLowerCase().includes('cannot'),
        `Unexpected error: ${e.message}`
      );
    }
    assert(threw, 'Should have thrown for overpayment');
  });

  // ─────────────────────────────────────────────────────────────
  // Test 6 — Fetch student fees with installment breakdown → PASS
  // ─────────────────────────────────────────────────────────────
  await test('6. Fetch student fees with installment breakdown → PASS', async () => {
    assert(studentDoc, 'Prerequisites missing');

    const result = await FeesService.getStudentFees(studentDoc._id.toString());

    assert(result.student,      'Missing student');
    assert(result.summary,      'Missing summary');
    assert(result.payments,     'Missing payments');
    assert(Array.isArray(result.installments), 'installments must be an array');
    assert(result.installments.length === 3, `Expected 3 installments, got ${result.installments.length}`);

    // First installment should be paid
    const first = result.installments[0];
    assert(first.status === 'paid',   `First installment should be 'paid', got '${first.status}'`);
    assert(first.paidAmount === 10000, `First paidAmount should be 10000, got ${first.paidAmount}`);
    assert(first.due === 0,           `First due should be 0, got ${first.due}`);

    // Summary sanity check
    assert(result.summary.totalPaid >= 10000, 'totalPaid should be >= 10000');
    assert(result.summary.totalDue  <= 20000, 'totalDue should be <= 20000');

    console.log(`       → Summary: paid=₹${result.summary.totalPaid}, due=₹${result.summary.totalDue}, status=${result.summary.status}`);
  });

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────
  await cleanup();

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉  All Fee module tests passed!');
  } else {
    console.log('  ⚠️   Some tests failed — check output above.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
})();
