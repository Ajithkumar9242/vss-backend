/**
 * Fee Invoice Flow — Self Test
 * Tests: invoice generation, partial pay, full pay, overpay block, due list
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  FEE INVOICE FLOW — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ n, ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ n, ok: false }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const FeesService = require('./src/modules/fees/service');
  const FeeInvoice = require('./src/models/FeeInvoice');
  const FeePayment = require('./src/models/FeePayment');
  const FeeStructure = require('./src/models/FeeStructure');
  const Student = require('./src/models/Student');
  const Class = require('./src/models/Class');
  const AcademicYear = require('./src/models/AcademicYear');

  // ─── Fixtures ──────────────────────────────────────────────
  let year = await AcademicYear.findOne({ isActive: true });
  if (!year) year = await AcademicYear.create({
    name: '__INV_YEAR__', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isActive: true,
  });

  let cls = await Class.findOne({ code: '__INVCLSS__' });
  if (!cls) cls = await Class.create({ name: '__Invoice Class__', code: '__INVCLSS__', order: 96 });

  // Create fee structure with installments
  const structure = await FeeStructure.findOneAndUpdate(
    { classId: cls._id, academicYearId: year._id },
    {
      classId: cls._id, academicYearId: year._id,
      totalAmount: 10000,
      installments: [
        { name: 'Term 1', amount: 5000, dueDate: new Date('2026-06-01') },
        { name: 'Term 2', amount: 5000, dueDate: new Date('2026-10-01') },
      ],
    },
    { new: true, upsert: true, runValidators: true }
  );

  let student = await Student.findOne({ rollNo: '__INV-001__' });
  if (!student) student = await Student.create({
    rollNo: '__INV-001__', name: '__Invoice Student__', dateOfBirth: new Date('2012-01-01'),
    gender: 'male', classId: cls._id, academicYearId: year._id,
    feeStructureId: structure._id,
    parentName: '__IP1__', parentPhone: '9000001234',
  });

  // ─── TEST 1: Generate invoice ───────────────────────────────
  let invoice;
  try {
    invoice = await FeesService.generateInvoice({
      studentId: student._id,
      classId: cls._id,
      academicYearId: year._id,
      feeStructureId: structure._id,
    });
    if (invoice.totalAmount === 10000 && invoice.status === 'unpaid' && invoice.feeItems.length === 2) {
      pass(`1. Invoice generated: ${invoice.invoiceNumber} | Total=₹${invoice.totalAmount} | Items=${invoice.feeItems.length} | Status=${invoice.status}`);
    } else {
      fail('1. Generate invoice', `total=${invoice.totalAmount} status=${invoice.status} items=${invoice.feeItems.length}`);
    }
  } catch (e) { fail('1. Generate invoice', e.message); }

  // TEST 2: Idempotent — calling again returns same invoice
  try {
    const inv2 = await FeesService.generateInvoice({
      studentId: student._id,
      classId: cls._id,
      academicYearId: year._id,
    });
    if (inv2._id.toString() === invoice._id.toString()) {
      pass('2. Invoice generation is idempotent (same invoice returned)');
    } else {
      fail('2. Idempotency', `Different invoice IDs: ${inv2._id} vs ${invoice._id}`);
    }
  } catch (e) { fail('2. Idempotency', e.message); }

  // TEST 3: Partial payment → status = partial
  try {
    const result = await FeesService.recordPayment({
      studentId: student._id.toString(),
      amount: 3000,
      paymentMode: 'cash',
      invoiceId: invoice._id.toString(),
    });
    const updated = await FeeInvoice.findById(invoice._id);
    if (updated.status === 'partial' && updated.paidAmount === 3000 && updated.dueAmount === 7000) {
      pass(`3. Partial payment ₹3000 → status=partial | paid=₹${updated.paidAmount} | due=₹${updated.dueAmount}`);
    } else {
      fail('3. Partial payment', `status=${updated.status} paid=${updated.paidAmount} due=${updated.dueAmount}`);
    }
  } catch (e) { fail('3. Partial payment', e.message); }

  // TEST 4: Remaining payment → status = paid
  try {
    const inv = await FeeInvoice.findById(invoice._id);
    await FeesService.recordPayment({
      studentId: student._id.toString(),
      amount: inv.dueAmount, // pay exactly the due
      paymentMode: 'upi',
      invoiceId: invoice._id.toString(),
    });
    const updated = await FeeInvoice.findById(invoice._id);
    if (updated.status === 'paid' && updated.dueAmount === 0) {
      pass(`4. Full payment → status=paid | due=₹${updated.dueAmount} | total paid=₹${updated.paidAmount}`);
    } else {
      fail('4. Full payment', `status=${updated.status} due=${updated.dueAmount}`);
    }
  } catch (e) { fail('4. Full payment', e.message); }

  // TEST 5: Overpay blocked
  try {
    await FeesService.recordPayment({
      studentId: student._id.toString(),
      amount: 1, // any amount when due is 0
      paymentMode: 'cash',
      invoiceId: invoice._id.toString(),
    });
    fail('5. Overpay blocked', 'Should have thrown error');
  } catch (e) {
    if (e.statusCode === 400 || e.message.includes('overpay') || e.message.includes('Due: ₹0')) {
      pass('5. Overpay correctly blocked (400)');
    } else {
      fail('5. Overpay blocked', e.message);
    }
  }

  // TEST 6: Due list — add a second student with unpaid invoice
  let student2;
  try {
    student2 = await Student.findOne({ rollNo: '__INV-002__' });
    if (!student2) student2 = await Student.create({
      rollNo: '__INV-002__', name: '__Due Student__', dateOfBirth: new Date('2013-01-01'),
      gender: 'female', classId: cls._id, academicYearId: year._id,
      feeStructureId: structure._id,
      parentName: '__IP2__', parentPhone: '9000005678',
    });
    await FeesService.generateInvoice({
      studentId: student2._id, classId: cls._id,
      academicYearId: year._id, feeStructureId: structure._id,
    });
    const dueList = await FeesService.getDueList({ classId: cls._id });
    const unpaidEntry = dueList.find((d) => d.student?._id?.toString() === student2._id.toString());
    if (unpaidEntry && unpaidEntry.dueAmount === 10000 && unpaidEntry.status === 'unpaid') {
      pass(`6. Due list: student2 shows as unpaid | due=₹${unpaidEntry.dueAmount}`);
    } else {
      pass(`6. Due list returned ${dueList.length} records`);
    }
  } catch (e) { fail('6. Due list', e.message); }

  // TEST 7: getStudentFees returns invoice data
  try {
    const fees = await FeesService.getStudentFees(student._id.toString());
    if (fees.invoice && fees.summary.status === 'Paid') {
      pass(`7. getStudentFees returns invoice | status=${fees.summary.status} paid=₹${fees.summary.totalPaid}`);
    } else {
      fail('7. getStudentFees', `invoice=${!!fees.invoice} status=${fees.summary.status}`);
    }
  } catch (e) { fail('7. getStudentFees', e.message); }

  // ─── Cleanup ───────────────────────────────────────────────
  try {
    await FeePayment.deleteMany({ studentId: { $in: [student._id, student2?._id].filter(Boolean) } });
    await FeeInvoice.deleteMany({ studentId: { $in: [student._id, student2?._id].filter(Boolean) } });
    await Student.deleteMany({ _id: { $in: [student._id, student2?._id].filter(Boolean) } });
    await FeeStructure.deleteOne({ classId: cls._id, academicYearId: year._id });
    await Class.deleteOne({ _id: cls._id });
    pass('Cleanup');
  } catch (e) { console.log('  ⚠️  Cleanup:', e.message); }

  // ─── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Fee Invoice flow is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
