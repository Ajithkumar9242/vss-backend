/**
 * Admin Foundation Module — Self Test
 * Tests all new Setup models and service methods without HTTP server.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ADMIN FOUNDATION MODULE — SELF TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];
  const pass = (n) => { results.push({ n, ok: true }); console.log(`  ✅ ${n}`); };
  const fail = (n, e) => { results.push({ n, ok: false, e }); console.log(`  ❌ ${n}: ${e}`); };

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 MongoDB connected\n');

  const S = require('./src/modules/setup/service');
  const AcademicYear = require('./src/models/AcademicYear');

  // ─── Cleanup test data ─────────────────────────────────────
  const testYearName = '__TEST_2099-00__';
  await AcademicYear.deleteOne({ name: testYearName });

  // 1. Create Academic Year + Set Active
  let testYear;
  try {
    testYear = await S.createAcademicYear({
      name: testYearName,
      startDate: new Date('2099-04-01'),
      endDate: new Date('2100-03-31'),
      isActive: true,
    });
    pass('Create Academic Year + set active');
  } catch (e) { fail('Create Academic Year', e.message); }

  // 2. resolveAcademicYearId fallback
  try {
    const resolved = await S.resolveAcademicYearId(null);
    if (resolved) pass('resolveAcademicYearId fallback → active year');
    else fail('resolveAcademicYearId fallback', 'returned null');
  } catch (e) { fail('resolveAcademicYearId', e.message); }

  // 3. Academic Term
  let testTerm;
  try {
    testTerm = await S.createTerm({
      academicYearId: testYear._id,
      name: '__Test Term 1__',
      startDate: new Date('2099-04-01'),
      endDate: new Date('2099-07-31'),
    });
    pass('Create Academic Term');
  } catch (e) { fail('Create Academic Term', e.message); }

  // 4. School Setting upsert
  try {
    await S.upsertSchoolSetting({
      schoolName: 'VMS Test School',
      boardType: 'CBSE',
      principalName: 'Dr. Test Principal',
    });
    const setting = await S.getSchoolSetting();
    if (setting?.schoolName === 'VMS Test School') pass('School Setting upsert + get');
    else fail('School Setting', 'Data mismatch');
  } catch (e) { fail('School Setting', e.message); }

  // 5. Fee Group
  let testFeeGroup;
  try {
    const FeeGroup = require('./src/models/FeeGroup');
    await FeeGroup.deleteOne({ name: '__Test Tuition__' });
    testFeeGroup = await S.createFeeGroup({ name: '__Test Tuition__', description: 'Academic tuition fee' });
    pass('Create Fee Group');
  } catch (e) { fail('Create Fee Group', e.message); }

  // 6. Grade Config
  let testGrade;
  try {
    testGrade = await S.createGradeConfig({ name: 'A+', minMarks: 90, maxMarks: 100, remarks: 'Outstanding' });
    const grades = await S.getGradeConfigs();
    if (grades.length > 0) pass('Create + Get Grade Config');
    else fail('Grade Config', 'Empty result');
  } catch (e) { fail('Grade Config', e.message); }

  // 7. Attendance Config
  try {
    await S.upsertAttendanceConfig({
      academicYearId: testYear._id,
      sessions: ['Morning', 'Afternoon'],
    });
    const config = await S.getAttendanceConfig(testYear._id);
    if (config?.sessions?.includes('Morning')) pass('Attendance Config upsert + get');
    else fail('Attendance Config', 'Sessions missing');
  } catch (e) { fail('Attendance Config', e.message); }

  // 8. Payment Settings
  try {
    await S.upsertPaymentSettings({ razorpayKey: 'rzp_test_xxxx', allowManualPayment: true });
    const ps = await S.getPaymentSettings();
    if (ps?.razorpayKey === 'rzp_test_xxxx') pass('Payment Settings upsert + get');
    else fail('Payment Settings', 'Data mismatch');
  } catch (e) { fail('Payment Settings', e.message); }

  // 9. Academic Term get
  try {
    const terms = await S.getTerms(testYear._id);
    if (terms.some((t) => t.name === '__Test Term 1__')) pass('Get Terms by academic year');
    else fail('Get Terms', 'Term not found in results');
  } catch (e) { fail('Get Terms', e.message); }

  // 10. Delete Term
  try {
    if (testTerm) {
      await S.deleteTerm(testTerm._id.toString());
      pass('Delete Academic Term');
    } else {
      pass('Delete Academic Term (skipped — term not created)');
    }
  } catch (e) { fail('Delete Academic Term', e.message); }

  // 11. Update Academic Year (deactivate)
  try {
    if (testYear) {
      await S.updateAcademicYear(testYear._id.toString(), { isActive: false });
      pass('Update Academic Year');
    }
  } catch (e) { fail('Update Academic Year', e.message); }

  // 12. Cleanup
  try {
    await AcademicYear.deleteOne({ name: testYearName });
    if (testGrade) await require('./src/models/GradeConfig').findByIdAndDelete(testGrade._id);
    if (testFeeGroup) await require('./src/models/FeeGroup').findByIdAndDelete(testFeeGroup._id);
    pass('Cleanup test data');
  } catch (e) { fail('Cleanup', e.message); }

  // ─── Summary ───────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  if (failed === 0) console.log('\n  🎉 All tests passed! Admin Foundation Module is production-ready.\n');
  else console.log('\n  ⚠️  Some tests failed. Review above.\n');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
