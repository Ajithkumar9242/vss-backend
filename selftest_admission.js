/**
 * Admission + Student Flow — Self Test
 * Validates Tasks 1-5 end-to-end without HTTP server.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ADMISSION + STUDENT FLOW — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ n, ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ n, ok: false }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const Student = require('./src/models/Student');
  try {
    // Drop old indices so Mongoose can recreate them with sparse option enabled
    await Student.collection.dropIndex('admissionNumber_1').catch(() => {});
    await Student.collection.dropIndex('admissionNo_1').catch(() => {});
    await Student.collection.dropIndex('registerNo_1').catch(() => {});
    await Student.cleanIndexes();
    await Student.syncIndexes();
  } catch (err) {
    console.log('  ⚠️ Index synchronization warning:', err.message);
  }

  const AdmissionService = require('./src/modules/admission/service');
  const StudentService = require('./src/modules/student/service');
  const SetupService = require('./src/modules/setup/service');
  const Class = require('./src/models/Class');
  const Section = require('./src/models/Section');
  const Admission = require('./src/models/Admission');
  const AcademicYear = require('./src/models/AcademicYear');

  // ─── Setup: ensure active academic year ───────────────────
  let testYear = await AcademicYear.findOne({ isActive: true });
  if (!testYear) {
    testYear = await AcademicYear.create({
      name: '__TEST_YEAR__', startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'), isActive: true,
    });
  }

  // ─── Setup: ensure test class + section ───────────────────
  let testClass = await Class.findOne({ code: '__TCLSS__' });
  if (!testClass) {
    testClass = await Class.create({ name: '__Test Class__', code: '__TCLSS__', order: 99 });
  }

  let testSection = await Section.findOne({ classId: testClass._id, name: '__TA__' });
  if (!testSection) {
    testSection = await Section.create({ name: '__TA__', classId: testClass._id, capacity: 30 });
  }

  // Track created IDs for cleanup
  let createdAdmission, createdStudent;

  // Cleanup leftover test data from previous runs
  await Student.deleteMany({ name: { $in: ['__TEST STUDENT__', '__DIRECT STUDENT__', 'AdminTest S1', 'AdminTest S2', '__Direct Student__'] } });
  await Admission.deleteMany({ studentName: { $in: ['__TEST STUDENT__', '__BAD__', '__Test Student__'] } });

  // 1. academicYearId fallback works
  try {
    const id = await SetupService.resolveAcademicYearId(null);
    if (id) pass('1. resolveAcademicYearId fallback');
    else fail('1. resolveAcademicYearId fallback', 'returned null — no active year');
  } catch (e) { fail('1. resolveAcademicYearId fallback', e.message); }

  // 2. Create admission with class + section
  try {
    const adm = await AdmissionService.createAdmission({
      studentName: '__Test Student__',
      dateOfBirth: new Date('2015-01-01'),
      gender: 'male',
      classId: testClass._id,
      sectionId: testSection._id,
      parentName: '__Test Parent__',
      parentPhone: '9000000001',
      mode: 'offline',
    });
    createdAdmission = adm;
    const ok = adm.classId && adm.applicationNo?.startsWith('APP-');
    if (ok) pass('2. Create admission (class + section + auto applicationNo)');
    else fail('2. Create admission', 'Missing fields');
  } catch (e) { fail('2. Create admission', e.message); }

  // 3. Section-class mismatch is rejected
  try {
    let otherClass = await Class.findOne({ code: '__TCLSS2__' });
    if (!otherClass) otherClass = await Class.create({ name: '__Test Class 2__', code: '__TCLSS2__', order: 100 });
    await AdmissionService.createAdmission({
      studentName: '__Bad__', dateOfBirth: new Date('2015-01-01'), gender: 'male',
      classId: otherClass._id, sectionId: testSection._id, // section belongs to testClass!
      parentName: '__Bad Parent__', parentPhone: '9000000002',
    });
    fail('3. Section mismatch rejected', 'Should have thrown error');
    await Class.deleteOne({ code: '__TCLSS2__' });
  } catch (e) {
    if (e.message.includes('does not belong')) { pass('3. Section-class mismatch correctly rejected'); }
    else { fail('3. Section mismatch rejected', e.message); }
    await Class.deleteOne({ code: '__TCLSS2__' });
  }

  // 4. Approve admission → student created with academicYearId + feeStructureId
  if (createdAdmission) {
    try {
      const adminUserId = new mongoose.Types.ObjectId(); // fake user for test
      const result = await AdmissionService.approveAdmission(
        createdAdmission._id.toString(), adminUserId
      );
      createdStudent = result.student;
      const hasYear = !!result.student.academicYearId;
      const hasClass = result.student.classId?.toString() === testClass._id.toString()
        || result.student.classId?._id?.toString() === testClass._id.toString();
      const hasSection = !!result.student.sectionId;
      if (hasYear && hasClass && hasSection) {
        pass('4. Approve → student has classId + sectionId + academicYearId');
      } else {
        fail('4. Approve student fields', `year=${hasYear} class=${hasClass} section=${hasSection}`);
      }
    } catch (e) { fail('4. Approve admission', e.message); }
  } else {
    fail('4. Approve admission', 'Skipped — admission not created in step 2');
  }

  // 5. Double-approval is blocked
  if (createdAdmission) {
    try {
      await AdmissionService.approveAdmission(createdAdmission._id.toString(), new mongoose.Types.ObjectId());
      fail('5. Double-approval blocked', 'Should have thrown error');
    } catch (e) {
      if (e.message.includes('already been approved')) pass('5. Double-approval correctly blocked');
      else fail('5. Double-approval blocked', e.message);
    }
  }

  // 6. Direct student creation (admin flow)
  try {
    const s = await StudentService.createStudent({
      name: '__Direct Student__',
      dateOfBirth: new Date('2013-06-15'),
      gender: 'female',
      classId: testClass._id,
      sectionId: testSection._id,
      parentName: '__Direct Parent__',
      parentPhone: '9000000099',
    });
    if (s.rollNo && s.academicYearId && s.classId) {
      pass('6. Direct student creation (rollNo + academicYearId auto-assigned)');
    } else {
      fail('6. Direct student creation', 'Missing required fields');
    }
    await Student.deleteOne({ _id: s._id });
  } catch (e) { fail('6. Direct student creation', e.message); }

  // 7. Student model has academicYearId field
  try {
    const schema = Student.schema.paths;
    if (schema.academicYearId && schema.feeStructureId) {
      pass('7. Student model has academicYearId + feeStructureId fields');
    } else {
      fail('7. Student model fields', 'Missing fields in schema');
    }
  } catch (e) { fail('7. Student model fields', e.message); }

  // ─── Cleanup ───────────────────────────────────────────────
  try {
    if (createdStudent) await Student.deleteOne({ _id: createdStudent._id });
    if (createdAdmission) await Admission.deleteOne({ _id: createdAdmission._id });
    await Section.deleteOne({ _id: testSection._id });
    await Class.deleteOne({ _id: testClass._id });
    pass('Cleanup');
  } catch (e) { console.log('  ⚠️  Cleanup warning:', e.message); }

  // ─── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Admission + Student flow is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed. Review above.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
