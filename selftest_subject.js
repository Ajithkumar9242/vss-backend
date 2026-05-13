/**
 * selftest_subject.js
 *
 * Self-contained integration test for the Subject module.
 * Run with:  node selftest_subject.js
 *
 * Tests:
 *  1. Create subject
 *  2. Duplicate code → must fail
 *  3. Fetch list (verify subject is in it)
 *  4. Update subject
 *  5. Soft delete (isActive = false)
 *  6. Assign subject to ClassConfig
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Subject     = require('./src/models/Subject');
const ClassConfig = require('./src/models/ClassConfig');
const Class       = require('./src/models/Class');
const AcademicYear = require('./src/models/AcademicYear');
const SubjectService = require('./src/modules/subject/service');

// ─── Helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

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

// ─── Main ────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪  Subject Module — Self Test\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // ── Cleanup from previous runs ─────────────────────────────
  await Subject.deleteMany({ code: { $in: ['SELFTEST01', 'SELFTEST02'] } });

  let createdId;
  let classConfigId;

  // ────────────────────────────────────────────────────────────
  // Test 1 — Create subject
  // ────────────────────────────────────────────────────────────
  await test('1. Create subject', async () => {
    const s = await SubjectService.create({
      name: 'Self Test Subject',
      code: 'SELFTEST01',
      type: 'theory',
    });
    assert(s._id, 'No _id returned');
    assert(s.code === 'SELFTEST01', `code mismatch: ${s.code}`);
    assert(s.isActive === true, 'Should be active by default');
    createdId = String(s._id);
  });

  // ────────────────────────────────────────────────────────────
  // Test 2 — Duplicate code → must fail
  // ────────────────────────────────────────────────────────────
  await test('2. Duplicate code → fail', async () => {
    let threw = false;
    try {
      await SubjectService.create({ name: 'Duplicate', code: 'selftest01' }); // lowercase → uppercased by service
    } catch (e) {
      threw = true;
      assert(e.message.includes('already exists'), `Unexpected error: ${e.message}`);
    }
    assert(threw, 'Should have thrown duplicate error');
  });

  // ────────────────────────────────────────────────────────────
  // Test 3 — Fetch list
  // ────────────────────────────────────────────────────────────
  await test('3. Fetch subject list', async () => {
    // isActive defaults to true in service, so we request all
    const result = await SubjectService.getAll({ isActive: 'true' });
    assert(Array.isArray(result.subjects), 'subjects should be an array');
    assert(result.total >= 1, 'total should be >= 1');
    const found = result.subjects.find((s) => s.code === 'SELFTEST01');
    assert(found, 'Created subject not found in list');
  });

  // ────────────────────────────────────────────────────────────
  // Test 4 — Update subject
  // ────────────────────────────────────────────────────────────
  await test('4. Update subject', async () => {
    assert(createdId, 'No createdId — test 1 must have passed');
    const updated = await SubjectService.update(createdId, {
      name: 'Self Test Updated',
      type: 'practical',
    });
    assert(updated.name === 'Self Test Updated', `name mismatch: ${updated.name}`);
    assert(updated.type === 'practical', `type mismatch: ${updated.type}`);
    assert(updated.code === 'SELFTEST01', 'code should not have changed');
  });

  // ────────────────────────────────────────────────────────────
  // Test 5 — Soft delete (isActive = false)
  // ────────────────────────────────────────────────────────────
  await test('5. Soft delete subject', async () => {
    assert(createdId, 'No createdId — test 1 must have passed');
    const deleted = await SubjectService.softDelete(createdId);
    assert(deleted.isActive === false, 'isActive should be false after soft delete');

    // Verify it no longer appears in active list
    const result = await SubjectService.getAll({ isActive: 'true' });
    const found = result.subjects.find((s) => String(s._id) === createdId);
    assert(!found, 'Soft-deleted subject should not appear in active list');
  });

  // ────────────────────────────────────────────────────────────
  // Test 6 — Assign to ClassConfig
  // ────────────────────────────────────────────────────────────
  await test('6. Assign subject to ClassConfig', async () => {
    // Re-activate the subject first (toggle twice to confirm both directions)
    await SubjectService.toggleActive(createdId);  // → active = true
    const toggled = await Subject.findById(createdId);
    assert(toggled.isActive === true, 'Toggle should set isActive = true');

    // Ensure a ClassConfig exists to test with
    let cfg = await ClassConfig.findOne();
    if (!cfg) {
      // Create minimal supporting docs
      let yr = await AcademicYear.findOne({ isActive: true });
      if (!yr) yr = await AcademicYear.create({ name: 'Test Year', startDate: new Date(), endDate: new Date(), isActive: true });

      let cls = await Class.findOne();
      if (!cls) cls = await Class.create({ name: 'Test Class', code: 'TSTCLS' });

      cfg = await ClassConfig.create({ classId: cls._id, academicYearId: yr._id });
    }
    classConfigId = String(cfg._id);

    // Add
    const added = await SubjectService.assignToClassConfig(classConfigId, createdId, 'add');
    const ids = added.subjects.map((s) => String(s._id || s));
    assert(ids.includes(createdId), 'Subject should be in ClassConfig.subjects after add');

    // Remove
    const removed = await SubjectService.assignToClassConfig(classConfigId, createdId, 'remove');
    const ids2 = removed.subjects.map((s) => String(s._id || s));
    assert(!ids2.includes(createdId), 'Subject should NOT be in ClassConfig.subjects after remove');
  });

  // ── Cleanup ──────────────────────────────────────────────────
  await Subject.deleteMany({ code: { $in: ['SELFTEST01', 'SELFTEST02'] } });

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉  All Subject module tests passed!');
  } else {
    console.log('  ⚠️   Some tests failed — check output above.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
})();
