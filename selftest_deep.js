/**
 * Deep validation — admission→student→invoice chain + feeItems integrity
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function deepTest() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected\n');

  const AdmissionService = require('./src/modules/admission/service');
  const StudentService   = require('./src/modules/student/service');
  const FeeInvoice       = require('./src/models/FeeInvoice');
  const Student          = require('./src/models/Student');
  const Class            = require('./src/models/Class');
  const Section          = require('./src/models/Section');
  const FeeStructure     = require('./src/models/FeeStructure');
  const AcademicYear     = require('./src/models/AcademicYear');
  const Admission        = require('./src/models/Admission');
  const FeePayment       = require('./src/models/FeePayment');

  const year = await AcademicYear.findOne({ isActive: true });
  const cls  = await Class.findOne({ code: '__SYS_TST__' }) || await Class.create({ name: '__DeepTest__', code: '__SYS_TST__', order: 99 });
  const sec  = await Section.findOne({ classId: cls._id }) || await Section.create({ name: '__DT-A__', classId: cls._id, capacity: 10 });

  // Ensure FeeStructure with installments
  let fs = await FeeStructure.findOne({ classId: cls._id, academicYearId: year._id });
  if (!fs) {
    fs = await FeeStructure.create({
      classId: cls._id, academicYearId: year._id, totalAmount: 15000,
      installments: [
        { name: 'Term 1', amount: 7500, dueDate: new Date('2026-06-01') },
        { name: 'Term 2', amount: 7500, dueDate: new Date('2026-10-01') },
      ],
    });
  }
  console.log('FeeStructure:', { total: fs.totalAmount, installments: fs.installments.length });

  let fails = 0;
  const ok = (label) => console.log(`  ✅ ${label}`);
  const no = (label) => { console.log(`  ❌ ${label}`); fails++; };
  const chk = (cond, label) => cond ? ok(label) : no(label);

  // ───── TEST 1: Admission → approve → student + auto-invoice ─────
  console.log('\n═══ TEST 1: Admission → Student → Auto Invoice ═══');
  const adm = await AdmissionService.createAdmission({
    studentName: '__DeepTest Student__', dateOfBirth: new Date('2012-01-01'),
    gender: 'male', classId: cls._id.toString(), sectionId: sec._id.toString(),
    parentName: '__DTP__', parentPhone: '7000000001', parentEmail: 'dt1@test.com', address: 'test',
  });
  const mockAdminId = new mongoose.Types.ObjectId().toString();
  const { student: s1 } = await AdmissionService.approveAdmission(adm._id.toString(), mockAdminId);

  const inv1 = await FeeInvoice.findOne({ studentId: s1._id });
  chk(!!s1.classId,          'Student.classId set');
  chk(!!s1.sectionId,        'Student.sectionId set');
  chk(!!s1.academicYearId,   'Student.academicYearId set');
  chk(!!s1.feeStructureId,   'Student.feeStructureId assigned');
  chk(!!inv1,                'Auto-invoice created');
  if (inv1) {
    chk(inv1.feeItems?.length > 0,    `feeItems populated (${inv1.feeItems?.length} items)`);
    chk(inv1.totalAmount > 0,         `totalAmount = ₹${inv1.totalAmount}`);
    chk(inv1.dueAmount > 0,           `dueAmount = ₹${inv1.dueAmount}`);
    chk(inv1.status === 'unpaid',     `status = ${inv1.status}`);
    chk(!!inv1.invoiceNumber,         `invoiceNumber = ${inv1.invoiceNumber}`);
    chk(!!inv1.feeStructureId,        `feeStructureId linked to structure`);
    // Verify feeItems match FeeStructure installments
    chk(inv1.feeItems[0].name === fs.installments[0].name,   `feeItems[0].name matches structure (${inv1.feeItems[0].name})`);
    chk(inv1.feeItems[0].amount === fs.installments[0].amount, `feeItems[0].amount matches (₹${inv1.feeItems[0].amount})`);
  }

  // ───── TEST 2: Direct Student → Auto Invoice ─────
  console.log('\n═══ TEST 2: Direct Student → Auto Invoice ═══');
  const s2 = await StudentService.createStudent({
    name: '__DeepTest Direct__', dateOfBirth: new Date('2013-02-02'),
    gender: 'female', classId: cls._id.toString(), sectionId: sec._id.toString(),
    parentName: '__DTP2__', parentPhone: '7000000002',
  });
  const inv2 = await FeeInvoice.findOne({ studentId: s2._id });
  chk(!!s2.rollNo,            `rollNo = ${s2.rollNo}`);
  chk(!!s2.academicYearId,    'academicYearId set');
  chk(!!inv2,                 'Auto-invoice created');
  if (inv2) {
    chk(inv2.feeItems?.length > 0,  `feeItems populated (${inv2.feeItems?.length} items)`);
    chk(inv2.totalAmount > 0,       `totalAmount = ₹${inv2.totalAmount}`);
    chk(inv2.status === 'unpaid',   `status = ${inv2.status}`);
    chk(!!inv2.feeStructureId,      `feeStructureId linked`);
  }

  // Cleanup
  await FeeInvoice.deleteMany({ studentId: { $in: [s1._id, s2._id] } });
  await FeePayment.deleteMany({ studentId: { $in: [s1._id, s2._id] } });
  await Student.deleteMany({ _id: { $in: [s1._id, s2._id] } });
  await Admission.deleteOne({ _id: adm._id });
  console.log('\n🧹 Cleanup done');

  console.log(`\n══════ Result: ${fails === 0 ? '🎉 ALL PASS' : `❌ ${fails} FAILURES`} ══════\n`);
  await mongoose.disconnect();
  process.exit(fails > 0 ? 1 : 0);
}
deepTest().catch((e) => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
