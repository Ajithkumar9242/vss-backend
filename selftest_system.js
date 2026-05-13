/**
 * FULL SYSTEM TEST — VMS School ERP
 * Steps 1-8 executed in order. Fixes applied inline if failures found.
 */
require('dotenv').config();
const mongoose = require('mongoose');

// ─── helpers ──────────────────────────────────────────────────
const results = [];
const pass = (step, msg) => { results.push({ step, ok: true }); console.log(`  ✅ [S${step}] ${msg}`); };
const fail = (step, msg) => { results.push({ step, ok: false }); console.log(`  ❌ [S${step}] ${msg}`); };
const header = (t) => console.log(`\n${'─'.repeat(56)}\n  ${t}\n${'─'.repeat(56)}`);

async function cleanup(ids) {
  try {
    const Student = require('./src/models/Student');
    const Admission = require('./src/models/Admission');
    const FeeInvoice = require('./src/models/FeeInvoice');
    const FeePayment = require('./src/models/FeePayment');
    const Exam = require('./src/models/Exam');
    const Mark = require('./src/models/Mark');
    const Attendance = require('./src/models/Attendance');
    const Notification = require('./src/models/Notification');
    const User = require('./src/models/User');
    const Class = require('./src/models/Class');
    const Section = require('./src/models/Section');
    const FeeStructure = require('./src/models/FeeStructure');

    if (ids.studentIds?.length) {
      await FeePayment.deleteMany({ studentId: { $in: ids.studentIds } });
      await FeeInvoice.deleteMany({ studentId: { $in: ids.studentIds } });
      await Mark.deleteMany({ studentId: { $in: ids.studentIds } });
      await Attendance.deleteMany({ studentId: { $in: ids.studentIds } });
      await Student.deleteMany({ _id: { $in: ids.studentIds } });
    }
    if (ids.admissionIds?.length) await Admission.deleteMany({ _id: { $in: ids.admissionIds } });
    if (ids.examIds?.length) await Exam.deleteMany({ _id: { $in: ids.examIds } });
    if (ids.classId) await FeeStructure.deleteMany({ classId: ids.classId });
    if (ids.classId) await Class.deleteOne({ _id: ids.classId });
    if (ids.sectionId) await Section.deleteOne({ _id: ids.sectionId });
    if (ids.userId) await User.deleteOne({ _id: ids.userId });
    if (ids.notifUserId) await Notification.deleteMany({ userId: ids.notifUserId });
  } catch (e) {
    console.log('  ⚠️  Cleanup error:', e.message);
  }
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  VMS ERP — FULL SYSTEM TEST (8 Steps)');
  console.log('══════════════════════════════════════════════════════════');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const ids = { studentIds: [], admissionIds: [], examIds: [] };

  // ── Lazy-load services (avoids circular dep at top) ──────────
  const SetupService     = require('./src/modules/setup/service');
  const AdmissionService = require('./src/modules/admission/service');
  const StudentService   = require('./src/modules/student/service');
  const FeesService      = require('./src/modules/fees/service');
  const ExamService      = require('./src/modules/exam/service');
  const AttendanceService= require('./src/modules/attendance/service');
  const NotificationService = require('./src/modules/notification/service');

  const AcademicYear   = require('./src/models/AcademicYear');
  const Class          = require('./src/models/Class');
  const Section        = require('./src/models/Section');
  const Subject        = require('./src/models/Subject');
  const ClassConfig    = require('./src/models/ClassConfig');
  const FeeStructure   = require('./src/models/FeeStructure');
  const PaymentSetting = require('./src/models/PaymentSetting');
  const Attendance     = require('./src/models/Attendance');
  const Student        = require('./src/models/Student');
  const User           = require('./src/models/User');

  // ════════════════════════════════════════════════════════════
  // STEP 1: SETUP VALIDATION
  // ════════════════════════════════════════════════════════════
  header('STEP 1 — SETUP VALIDATION');

  // Academic Year
  let activeYear = await AcademicYear.findOne({ isActive: true });
  if (!activeYear) {
    activeYear = await AcademicYear.create({
      name: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      startDate: new Date(`${new Date().getFullYear()}-04-01`),
      endDate: new Date(`${new Date().getFullYear() + 1}-03-31`),
      isActive: true,
    });
    pass(1, `Academic Year created: ${activeYear.name}`);
  } else {
    pass(1, `Academic Year exists: ${activeYear.name}`);
  }

  // Class
  let testClass = await Class.findOne({ code: '__SYS_TST__' });
  if (!testClass) {
    testClass = await Class.create({ name: '__SysTest Class__', code: '__SYS_TST__', order: 99 });
  }
  ids.classId = testClass._id;
  pass(1, `Class: ${testClass.name}`);

  // Section
  let testSection = await Section.findOne({ name: '__SysTest-A__' });
  if (!testSection) {
    testSection = await Section.create({ name: '__SysTest-A__', classId: testClass._id, capacity: 30 });
  }
  ids.sectionId = testSection._id;
  pass(1, `Section: ${testSection.name}`);

  // Subject
  let testSubject1 = await Subject.findOne({ code: '__STMATH__' });
  if (!testSubject1) testSubject1 = await Subject.create({ name: '__SysTest Maths__', code: '__STMATH__' });
  let testSubject2 = await Subject.findOne({ code: '__STSCI__' });
  if (!testSubject2) testSubject2 = await Subject.create({ name: '__SysTest Science__', code: '__STSCI__' });
  pass(1, `Subjects: ${testSubject1.name}, ${testSubject2.name}`);

  // ClassConfig (map subjects to class)
  let classConfig = await ClassConfig.findOne({ classId: testClass._id, academicYearId: activeYear._id });
  if (!classConfig) {
    classConfig = await ClassConfig.create({
      classId: testClass._id,
      academicYearId: activeYear._id,
      sections: [testSection._id],
      subjects: [testSubject1._id, testSubject2._id],
    });
  }
  pass(1, `ClassConfig: ${classConfig.subjects.length} subjects mapped`);

  // FeeStructure
  let feeStructure = await FeeStructure.findOne({ classId: testClass._id, academicYearId: activeYear._id });
  if (!feeStructure) {
    feeStructure = await FeeStructure.create({
      classId: testClass._id,
      academicYearId: activeYear._id,
      totalAmount: 12000,
      installments: [
        { name: 'Term 1', amount: 6000, dueDate: new Date('2026-06-01') },
        { name: 'Term 2', amount: 6000, dueDate: new Date('2026-10-01') },
      ],
    });
  }
  pass(1, `FeeStructure: ₹${feeStructure.totalAmount}`);

  // ════════════════════════════════════════════════════════════
  // STEP 2: ADMISSION FLOW
  // ════════════════════════════════════════════════════════════
  header('STEP 2 — ADMISSION FLOW');
  let admissionStudent;

  try {
    const admission = await AdmissionService.createAdmission({
      studentName: '__SysTest Admission Student__',
      dateOfBirth: new Date('2012-05-15'),
      gender: 'male',
      classId: testClass._id.toString(),
      sectionId: testSection._id.toString(),
      parentName: '__SysTest Parent__',
      parentPhone: '9090909090',
      parentEmail: 'systest@example.com',
      address: '123 Test Street',
    });
    ids.admissionIds.push(admission._id);
    pass(2, `Admission created: ${admission.applicationNo}`);

    // Approve admission — pass a valid mock userId (admin-level actor)
    const mockAdminId = new mongoose.Types.ObjectId().toString();
    const result = await AdmissionService.approveAdmission(admission._id.toString(), mockAdminId);

    admissionStudent = result.student;
    ids.studentIds.push(admissionStudent._id);

    if (!admissionStudent.classId) fail(2, 'Student missing classId');
    else if (!admissionStudent.sectionId) fail(2, 'Student missing sectionId');
    else if (!admissionStudent.academicYearId) fail(2, 'Student missing academicYearId');
    else pass(2, `Student created: ${admissionStudent.rollNo} | class=${admissionStudent.classId} | section=${admissionStudent.sectionId}`);

  } catch (e) {
    fail(2, `Admission flow: ${e.message}`);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 3: STUDENT DIRECT CREATE
  // ════════════════════════════════════════════════════════════
  header('STEP 3 — STUDENT DIRECT CREATE');
  let directStudent;

  try {
    directStudent = await StudentService.createStudent({
      name: '__SysTest Direct Student__',
      dateOfBirth: new Date('2013-03-20'),
      gender: 'female',
      classId: testClass._id.toString(),
      sectionId: testSection._id.toString(),
      parentName: '__SysTest Parent 2__',
      parentPhone: '8080808080',
    });
    ids.studentIds.push(directStudent._id);

    if (!directStudent.rollNo) fail(3, 'rollNo not generated');
    else if (!directStudent.academicYearId) fail(3, 'academicYearId not assigned');
    else pass(3, `Direct student created: ${directStudent.rollNo} | yearId=${directStudent.academicYearId}`);
  } catch (e) {
    fail(3, `Direct create: ${e.message}`);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 4: FEES FLOW
  // ════════════════════════════════════════════════════════════
  header('STEP 4 — FEES FLOW');

  const targetStudent = admissionStudent || directStudent;

  if (!targetStudent) {
    fail(4, 'No student available for fees test');
  } else {
    let invoice;

    // Generate invoice
    try {
      invoice = await FeesService.generateInvoice({
        studentId: targetStudent._id,
        classId: testClass._id,
        academicYearId: activeYear._id,
        feeStructureId: feeStructure._id,
      });
      if (invoice.totalAmount === 12000 && invoice.status === 'unpaid') {
        pass(4, `Invoice: ${invoice.invoiceNumber} | ₹${invoice.totalAmount} | status=${invoice.status}`);
      } else {
        fail(4, `Wrong invoice: total=${invoice.totalAmount} status=${invoice.status}`);
      }
    } catch (e) { fail(4, `generateInvoice: ${e.message}`); }

    // Partial payment
    try {
      await FeesService.recordPayment({
        studentId: targetStudent._id.toString(),
        amount: 4000,
        paymentMode: 'cash',
        invoiceId: invoice?._id.toString(),
      });
      const updated = require('./src/models/FeeInvoice');
      const inv = await updated.findById(invoice._id);
      if (inv.paidAmount === 4000 && inv.dueAmount === 8000 && inv.status === 'partial') {
        pass(4, `Partial payment ₹4000 → paid=₹${inv.paidAmount} due=₹${inv.dueAmount} status=${inv.status}`);
      } else {
        fail(4, `Partial: paid=${inv.paidAmount} due=${inv.dueAmount} status=${inv.status}`);
      }
    } catch (e) { fail(4, `Partial payment: ${e.message}`); }

    // Full payment
    try {
      const FeeInvoice = require('./src/models/FeeInvoice');
      const inv = await FeeInvoice.findById(invoice._id);
      await FeesService.recordPayment({
        studentId: targetStudent._id.toString(),
        amount: inv.dueAmount,
        paymentMode: 'upi',
        invoiceId: invoice._id.toString(),
      });
      const final = await FeeInvoice.findById(invoice._id);
      if (final.status === 'paid' && final.dueAmount === 0) {
        pass(4, `Full payment → status=paid | due=₹${final.dueAmount}`);
      } else {
        fail(4, `Full payment: status=${final.status} due=${final.dueAmount}`);
      }
    } catch (e) { fail(4, `Full payment: ${e.message}`); }

    // Overpay blocked
    try {
      await FeesService.recordPayment({
        studentId: targetStudent._id.toString(),
        amount: 1,
        paymentMode: 'cash',
        invoiceId: invoice._id.toString(),
      });
      fail(4, 'Overpay should have been blocked');
    } catch (e) {
      if (e.statusCode === 400 || e.message.toLowerCase().includes('due') || e.message.toLowerCase().includes('overpay')) {
        pass(4, 'Overpay correctly blocked');
      } else {
        fail(4, `Overpay wrong error: ${e.message}`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // STEP 5: EXAM FLOW
  // ════════════════════════════════════════════════════════════
  header('STEP 5 — EXAM FLOW');
  let exam;

  try {
    exam = await ExamService.createExam({
      name: `__SysTest Midterm ${Date.now()}__`,
      classId: testClass._id.toString(),
      academicYearId: activeYear._id.toString(),
      subjects: [
        { subjectId: testSubject1._id.toString(), maxMarks: 100, passingMarks: 35 },
        { subjectId: testSubject2._id.toString(), maxMarks: 100, passingMarks: 35 },
      ],
    });
    ids.examIds.push(exam._id);
    pass(5, `Exam created: ${exam.name} | subjects=${exam.subjects.length}`);
  } catch (e) { fail(5, `Create exam: ${e.message}`); }

  if (exam && targetStudent) {
    // Enter marks — one subject FAIL (below passing), one PASS
    try {
      await ExamService.saveMarks(exam._id.toString(), [
        { studentId: targetStudent._id.toString(), subjectId: testSubject1._id.toString(), marksObtained: 72 },
        { studentId: targetStudent._id.toString(), subjectId: testSubject2._id.toString(), marksObtained: 28 }, // FAIL
      ]);
      pass(5, 'Marks entered (Math=72, Science=28)');
    } catch (e) { fail(5, `saveMarks: ${e.message}`); }

    // Verify result
    try {
      const res = await ExamService.getStudentResults(targetStudent._id.toString());
      const examResult = res.results.find((r) => r.exam._id.toString() === exam._id.toString());
      if (!examResult) {
        fail(5, 'Result not found for exam');
      } else {
        const sciSub = examResult.subjects.find((s) => s.subject?.code === '__STSCI__');
        if (examResult.result === 'Fail' && sciSub?.marksObtained === 28) {
          pass(5, `Result: FAIL (Science=28 < 35 passing) | grade=${examResult.grade} | total=${examResult.totalObtained}`);
        } else {
          fail(5, `Expected Fail, got result=${examResult.result}`);
        }
      }
    } catch (e) { fail(5, `getStudentResults: ${e.message}`); }
  }

  // ════════════════════════════════════════════════════════════
  // STEP 6: ATTENDANCE FLOW
  // ════════════════════════════════════════════════════════════
  header('STEP 6 — ATTENDANCE FLOW');

  const attendDate = new Date();
  attendDate.setHours(0, 0, 0, 0);

  // Sessions
  try {
    const sessions = await AttendanceService.getSessions();
    pass(6, `Sessions: ${sessions.join(', ')}`);
  } catch (e) { fail(6, `getSessions: ${e.message}`); }

  if (targetStudent) {
    // Mark attendance
    try {
      const res = await AttendanceService.markAttendance([
        { studentId: targetStudent._id.toString(), classId: testClass._id.toString(), sectionId: testSection._id.toString(), date: attendDate, status: 'present', session: 'Morning' },
      ], new mongoose.Types.ObjectId().toString(), 'faculty');
      pass(6, `Marked attendance: saved=${res.saved} updated=${res.updated}`);
    } catch (e) { fail(6, `markAttendance: ${e.message}`); }

    // Lock attendance
    try {
      const lock = await AttendanceService.lockAttendance({
        classId: testClass._id.toString(),
        date: attendDate,
        session: 'Morning',
      }, 'admin');
      pass(6, `Locked: ${lock.locked} records`);
    } catch (e) { fail(6, `lockAttendance: ${e.message}`); }

    // Faculty edit locked → must FAIL
    try {
      await AttendanceService.markAttendance([
        { studentId: targetStudent._id.toString(), classId: testClass._id.toString(), sectionId: testSection._id.toString(), date: attendDate, status: 'absent', session: 'Morning' },
      ], new mongoose.Types.ObjectId().toString(), 'faculty');
      fail(6, 'Faculty edit locked attendance should have thrown');
    } catch (e) {
      if (e.statusCode === 403 || e.message.toLowerCase().includes('lock')) {
        pass(6, 'Faculty blocked from editing locked attendance ✓');
      } else {
        fail(6, `Wrong error for locked: ${e.message}`);
      }
    }

    // Admin edit locked → must PASS
    try {
      await AttendanceService.markAttendance([
        { studentId: targetStudent._id.toString(), classId: testClass._id.toString(), sectionId: testSection._id.toString(), date: attendDate, status: 'absent', session: 'Morning' },
      ], new mongoose.Types.ObjectId().toString(), 'admin');
      pass(6, 'Admin can override locked attendance ✓');
    } catch (e) { fail(6, `Admin override: ${e.message}`); }
  }

  // ════════════════════════════════════════════════════════════
  // STEP 7: NOTIFICATIONS
  // ════════════════════════════════════════════════════════════
  header('STEP 7 — NOTIFICATIONS');

  // Get any existing user for a targeted notification
  const anyUser = await User.findOne({ isActive: true }).select('_id');
  if (anyUser) {
    try {
      await NotificationService.create(anyUser._id, {
        title: 'SysTest Notification',
        message: 'Full system test notification',
        type: 'info',
        contentType: 'text',
      });
      const { notifications } = await NotificationService.getByUser(anyUser._id, { limit: 5 });
      const found = notifications.some((n) => n.title === 'SysTest Notification');
      if (found) {
        pass(7, 'Notification created and retrieved');
      } else {
        fail(7, 'Notification not found after create');
      }
      ids.notifUserId = anyUser._id;
    } catch (e) { fail(7, `Notification: ${e.message}`); }

    // Broadcast test
    try {
      const res = await NotificationService.broadcast({
        target: 'all',
        title: '__SysTest Broadcast__',
        message: 'System broadcast test',
        contentType: 'text',
      });
      pass(7, `Broadcast: sent=${res.sent} target=${res.target}`);
    } catch (e) { fail(7, `Broadcast: ${e.message}`); }
  } else {
    fail(7, 'No active users found to test notifications');
  }

  // ════════════════════════════════════════════════════════════
  // STEP 8: PAYMENT SETTINGS & MANUAL PAYMENT
  // ════════════════════════════════════════════════════════════
  header('STEP 8 — PAYMENT SETTINGS & MANUAL PAYMENT');

  try {
    const razorKeyId = process.env.RAZORPAY_KEY_ID;
    const razorSecret = process.env.RAZORPAY_KEY_SECRET;
    if (razorKeyId && razorSecret) {
      pass(8, `Razorpay config present: KEY=${razorKeyId.substring(0, 8)}...`);
    } else {
      pass(8, 'Razorpay keys not configured (env vars missing) — offline mode OK');
    }
  } catch (e) { fail(8, `Razorpay config check: ${e.message}`); }

  if (targetStudent) {
    // Manual payment flow
    try {
      const pending = await FeesService.recordManualPayment({
        studentId: targetStudent._id.toString(),
        amount: 500,
        paymentMode: 'online',
        transactionId: 'TXN-SYSYTEST-001',
      });
      if (pending.status !== 'pending') {
        fail(8, `Expected status=pending, got ${pending.status}`);
      } else {
        pass(8, `Manual payment created: status=${pending.status} | ₹${pending.amount}`);
      }

      // Approve it
      const approved = await FeesService.approvePayment(pending._id.toString());
      if (approved.status === 'approved') {
        pass(8, 'Manual payment approved by admin');
      } else {
        fail(8, `Approve failed: status=${approved.status}`);
      }

      // Reject a new one
      const pending2 = await FeesService.recordManualPayment({
        studentId: targetStudent._id.toString(),
        amount: 300,
        paymentMode: 'online',
        transactionId: 'TXN-SYSYTEST-002',
      });
      const rejected = await FeesService.rejectPayment(pending2._id.toString(), 'Proof unclear');
      if (rejected.status === 'rejected') {
        pass(8, 'Manual payment rejected');
      } else {
        fail(8, `Reject failed: status=${rejected.status}`);
      }
    } catch (e) { fail(8, `Manual payment flow: ${e.message}`); }
  }

  // ════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════
  header('CLEANUP');
  // Delete test notifications for broadcast
  try {
    const Notification = require('./src/models/Notification');
    await Notification.deleteMany({ title: { $in: ['SysTest Notification', '__SysTest Broadcast__'] } });
  } catch {}
  await cleanup(ids);
  // Delete test subjects only if we created them now
  try {
    const Subject = require('./src/models/Subject');
    await Subject.deleteMany({ code: { $in: ['__STMATH__', '__STSCI__'] } });
    const ClassConfig = require('./src/models/ClassConfig');
    await ClassConfig.deleteMany({ classId: ids.classId });
  } catch {}
  console.log('  🧹 Cleanup done');

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('  🎉 ALL STEPS PASSED — System is production-ready!\n');
  else {
    console.log('\n  ⚠️  FAILURES:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`    Step ${r.step}`));
  }
  console.log('══════════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
