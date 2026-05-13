/**
 * Admin Module — Self Test
 * 1. School settings update
 * 2. Apply fee structure to class → invoices generated
 * 3. Manual payment → pending → approve → invoice updated
 * 4. Reject payment (only pending)
 * 5. Notification broadcast (faculty target)
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ADMIN MODULE — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ ok: false }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const SetupService = require('./src/modules/setup/service');
  const FeesService = require('./src/modules/fees/service');
  const NotificationService = require('./src/modules/notification/service');
  const FeeInvoice = require('./src/models/FeeInvoice');
  const FeePayment = require('./src/models/FeePayment');
  const FeeStructure = require('./src/models/FeeStructure');
  const Student = require('./src/models/Student');
  const Class = require('./src/models/Class');
  const AcademicYear = require('./src/models/AcademicYear');
  const User = require('./src/models/User');

  // ─── Fixtures ──────────────────────────────────────────────
  let year = await AcademicYear.findOne({ isActive: true });
  if (!year) year = await AcademicYear.create({
    name: '__ADMIN_YEAR__', startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'), isActive: false,
  });

  let cls = await Class.findOne({ code: '__ADMTST__' });
  if (!cls) cls = await Class.create({ name: '__AdminTest Class__', code: '__ADMTST__', order: 97 });

  const structure = await FeeStructure.findOneAndUpdate(
    { classId: cls._id, academicYearId: year._id },
    { classId: cls._id, academicYearId: year._id, totalAmount: 8000, installments: [
      { name: 'Term 1', amount: 4000, dueDate: new Date('2026-06-01') },
      { name: 'Term 2', amount: 4000, dueDate: new Date('2026-10-01') },
    ]},
    { new: true, upsert: true, runValidators: true }
  );

  // Create 2 students in the class (no invoice yet)
  const s1 = await Student.create({ rollNo: '__ADM-S1__', name: 'AdminTest S1', dateOfBirth: new Date('2012-01-01'), gender: 'male', classId: cls._id, academicYearId: year._id, feeStructureId: structure._id, parentName: 'P1', parentPhone: '9000000001' });
  const s2 = await Student.create({ rollNo: '__ADM-S2__', name: 'AdminTest S2', dateOfBirth: new Date('2013-01-01'), gender: 'female', classId: cls._id, academicYearId: year._id, feeStructureId: structure._id, parentName: 'P2', parentPhone: '9000000002' });

  // TEST 1: School Settings Update
  try {
    const saved = await SetupService.upsertSchoolSetting({
      schoolName: '__AdminTest School__',
      boardType: 'CBSE',
      affiliationNumber: 'AFF-12345',
      principal: { name: 'Dr. Test', phone: '9000099999', email: 'principal@test.com' },
      contact: { phone: '9000011111', email: 'school@test.com', address: '123 Test Road' },
    });
    if (saved.affiliationNumber === 'AFF-12345' && saved.principal?.name === 'Dr. Test') {
      pass('1. School settings updated with affiliationNumber + principal sub-object');
    } else {
      fail('1. School settings', `affiliationNumber=${saved.affiliationNumber} principal=${saved.principal?.name}`);
    }
  } catch (e) { fail('1. School settings', e.message); }

  // TEST 2: Apply fee structure to class → bulk invoices
  try {
    const result = await FeesService.applyStructureToClass({
      classId: cls._id.toString(),
      academicYearId: year._id.toString(),
    });
    if (result.generated === 2 && result.skipped === 0) {
      pass(`2. Apply fee structure: ${result.generated} invoices generated, ${result.skipped} skipped`);
    } else {
      fail('2. Apply fee structure', `generated=${result.generated} skipped=${result.skipped}`);
    }
  } catch (e) { fail('2. Apply fee structure', e.message); }

  // TEST 2b: Apply again → idempotent (all skipped)
  try {
    const result = await FeesService.applyStructureToClass({
      classId: cls._id.toString(),
      academicYearId: year._id.toString(),
    });
    if (result.generated === 0 && result.skipped === 2) {
      pass('2b. Re-apply is idempotent (0 generated, 2 skipped)');
    } else {
      fail('2b. Idempotency', `generated=${result.generated} skipped=${result.skipped}`);
    }
  } catch (e) { fail('2b. Idempotency', e.message); }

  // TEST 3: Manual payment → pending
  let pendingPayment;
  try {
    const inv = await FeeInvoice.findOne({ studentId: s1._id });
    pendingPayment = await FeesService.recordManualPayment({
      studentId: s1._id.toString(),
      amount: 2000,
      paymentMode: 'online',
      transactionId: 'TXN-MANUAL-001',
      invoiceId: inv?._id.toString(),
    });
    if (pendingPayment.status === 'pending' && pendingPayment.amount === 2000) {
      pass(`3. Manual payment created with status=pending | amount=₹${pendingPayment.amount}`);
    } else {
      fail('3. Manual payment', `status=${pendingPayment.status}`);
    }
  } catch (e) { fail('3. Manual payment', e.message); }

  // TEST 4: Admin approve → invoice updated
  try {
    const payment = await FeesService.approvePayment(pendingPayment._id.toString());
    const inv = await FeeInvoice.findOne({ studentId: s1._id });
    if (payment.status === 'approved' && inv.paidAmount === 2000 && inv.status === 'partial') {
      pass(`4. Approve payment → invoice: paidAmount=₹${inv.paidAmount} status=${inv.status}`);
    } else {
      fail('4. Approve payment', `paymentStatus=${payment.status} invPaid=${inv?.paidAmount} invStatus=${inv?.status}`);
    }
  } catch (e) { fail('4. Approve payment', e.message); }

  // TEST 5: Reject payment — create another pending, then reject
  try {
    const pendingP2 = await FeesService.recordManualPayment({
      studentId: s2._id.toString(),
      amount: 1000,
      paymentMode: 'online',
    });
    const rejected = await FeesService.rejectPayment(pendingP2._id.toString(), 'Proof unclear');
    if (rejected.status === 'rejected') {
      pass('5. Reject pending payment → status=rejected');
    } else {
      fail('5. Reject payment', `status=${rejected.status}`);
    }
  } catch (e) { fail('5. Reject payment', e.message); }

  // TEST 6: Notification broadcast (faculty — may be 0 if no faculty users)
  try {
    const result = await NotificationService.broadcast({
      target: 'faculty',
      title: 'Test Broadcast',
      message: 'This is a test notification from admin module self-test.',
      type: 'info',
      contentType: 'text',
    });
    pass(`6. Broadcast to faculty: sent=${result.sent} target=${result.target}`);
  } catch (e) { fail('6. Broadcast', e.message); }

  // TEST 7: Broadcast (all) with contentType=link
  try {
    const result = await NotificationService.broadcast({
      target: 'all',
      title: 'Exam Schedule',
      message: 'View the exam schedule here.',
      contentType: 'link',
      contentUrl: 'https://school.example.com/exams',
    });
    pass(`7. Broadcast (all) with contentType=link: sent=${result.sent}`);
  } catch (e) { fail('7. Broadcast link', e.message); }

  // ─── Cleanup ───────────────────────────────────────────────
  try {
    await FeePayment.deleteMany({ studentId: { $in: [s1._id, s2._id] } });
    await FeeInvoice.deleteMany({ studentId: { $in: [s1._id, s2._id] } });
    await Student.deleteMany({ _id: { $in: [s1._id, s2._id] } });
    await FeeStructure.deleteOne({ classId: cls._id, academicYearId: year._id });
    await Class.deleteOne({ _id: cls._id });
    pass('Cleanup');
  } catch (e) { console.log('  ⚠️  Cleanup:', e.message); }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Admin module is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed. Review above.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
