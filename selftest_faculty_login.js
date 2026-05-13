/**
 * Faculty Login — Full Flow Test
 * Step 1: Create faculty → User record created (role=faculty)
 * Step 2: Login with email + default password
 * Step 3: GET /me → linkedEntity populated (faculty with classes/subjects)
 * Step 4: Verify protected faculty route authorization (JWT + role=faculty)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const pass = (n, msg) => console.log(`  ✅ [${n}] ${msg}`);
const fail = (n, msg) => { console.log(`  ❌ [${n}] ${msg}`); };
const sep = (t) => console.log(`\n${'─'.repeat(54)}\n  ${t}\n${'─'.repeat(54)}`);

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  FACULTY LOGIN — FULL FLOW TEST');
  console.log('══════════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  📦 Connected\n');

  const AuthService    = require('./src/modules/auth/service');
  const FacultyService = require('./src/modules/faculty/service');
  const Faculty        = require('./src/models/Faculty');
  const User           = require('./src/models/User');
  const Subject        = require('./src/models/Subject');
  const Class          = require('./src/models/Class');

  // ─── fixtures ────────────────────────────────────────────
  let cls     = await Class.findOne({ code: '__FCTST__' });
  if (!cls) cls = await Class.create({ name: '__FacTest Class__', code: '__FCTST__', order: 98 });

  let subj    = await Subject.findOne({ code: '__FCSUB__' });
  if (!subj) subj = await Subject.create({ name: '__FacTest Subject__', code: '__FCSUB__' });

  const testEmail = `faculty.test.${Date.now()}@vmstest.com`;
  let faculty, user;

  // ────────────────────────────────────────────────────────
  // STEP 1: Create faculty → verify User record
  // ────────────────────────────────────────────────────────
  sep('STEP 1 — CREATE FACULTY');

  try {
    faculty = await FacultyService.create({
      name: '__FacTest Teacher__',
      email: testEmail,
      phone: '9191919191',
      designation: 'Lecturer',
      department: 'Science',
    });
    pass(1, `Faculty created: ${faculty.employeeId}`);
  } catch (e) { fail(1, `FacultyService.create: ${e.message}`); process.exit(1); }

  // Wait briefly for async user creation (fire-and-forget)
  await new Promise((r) => setTimeout(r, 800));

  try {
    user = await User.findOne({ email: testEmail });
    if (!user) {
      fail(1, 'User record NOT created for faculty (async creation failed)');
      // Diagnose: try creating manually
      console.log('    ↳ Attempting sync user creation...');
      user = await require('./src/modules/auth/service').createFacultyUser(faculty);
    }
    if (!user) { fail(1, 'Cannot create User — aborting'); process.exit(1); }

    if (user.role !== 'faculty') fail(1, `User role is "${user.role}", expected "faculty"`);
    else if (!user.email) fail(1, 'User has no email');
    else if (!user.referenceId) fail(1, 'User.referenceId (→faculty) not set');
    else pass(1, `User: email=${user.email} | role=${user.role} | referenceId=${user.referenceId}`);

    // Also verify faculty.userId was set back
    const freshFaculty = await Faculty.findById(faculty._id);
    if (!freshFaculty.userId) {
      fail(1, 'Faculty.userId not linked back to User');
    } else {
      pass(1, `Faculty.userId linked: ${freshFaculty.userId}`);
    }
  } catch (e) { fail(1, `User verify: ${e.message}`); }

  // ────────────────────────────────────────────────────────
  // STEP 2: Login with email + default password
  // ────────────────────────────────────────────────────────
  sep('STEP 2 — LOGIN');

  let token;
  try {
    const { user: loggedUser, token: tok } = await AuthService.loginUser(testEmail, 'Vms@1234');
    token = tok;

    if (!token) fail(2, 'No token returned');
    else if (loggedUser.role !== 'faculty') fail(2, `Wrong role: ${loggedUser.role}`);
    else pass(2, `Login OK | token length=${token.length} | role=${loggedUser.role}`);
  } catch (e) {
    fail(2, `loginUser: ${e.message}`);
    console.log('    ↳ Diagnosing: checking if password was hashed correctly...');
    const u = await User.findOne({ email: testEmail }).select('+password');
    console.log(`    ↳ Password hash present: ${!!u?.password}`);
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────
  // STEP 3: GET /me → linkedEntity
  // ────────────────────────────────────────────────────────
  sep('STEP 3 — GET /me (linkedEntity)');

  try {
    const me = await AuthService.getCurrentUser(user._id.toString());

    if (!me) fail(3, 'getCurrentUser returned null');
    else if (me.role !== 'faculty') fail(3, `Wrong role: ${me.role}`);
    else pass(3, `getCurrentUser: role=${me.role}`);

    if (me.linkedEntity === null && me.role === 'faculty') {
      fail(3, 'linkedEntity is NULL — referenceId may not be set');
      const u = await User.findById(user._id);
      console.log(`    ↳ User.referenceId: ${u?.referenceId}`);
    } else if (!me.linkedEntity) {
      fail(3, `linkedEntity missing: ${JSON.stringify(me.linkedEntity)}`);
    } else {
      pass(3, `linkedEntity: ${me.linkedEntity.name} | classes=${me.linkedEntity.assignedClasses?.length || 0} | subjects=${me.linkedEntity.subjects?.length || 0}`);
    }
  } catch (e) { fail(3, `getCurrentUser: ${e.message}`); }

  // Assign class + subject, recheck
  try {
    await FacultyService.assignClasses(faculty._id.toString(), [cls._id.toString()]);
    await FacultyService.assignSubjects(faculty._id.toString(), [subj._id.toString()]);
    const me2 = await AuthService.getCurrentUser(user._id.toString());
    if (me2.linkedEntity?.assignedClasses?.length > 0 && me2.linkedEntity?.subjects?.length > 0) {
      pass(3, `linkedEntity populated after assignment: classes=${me2.linkedEntity.assignedClasses.length} subjects=${me2.linkedEntity.subjects.length}`);
    } else {
      fail(3, `linkedEntity after assignment: classes=${me2.linkedEntity?.assignedClasses?.length} subjects=${me2.linkedEntity?.subjects?.length}`);
    }
  } catch (e) { fail(3, `Assign + recheck: ${e.message}`); }

  // ────────────────────────────────────────────────────────
  // STEP 4: Protected faculty route authorization
  // ────────────────────────────────────────────────────────
  sep('STEP 4 — JWT DECODE + ROLE AUTH');

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'faculty') {
      fail(4, `JWT role="${decoded.role}", expected "faculty"`);
    } else {
      pass(4, `JWT decoded: id=${decoded.id} | role=${decoded.role}`);
    }

    // Simulate protect middleware lookup
    const foundUser = await User.findById(decoded.id).select('-password');
    if (!foundUser) fail(4, 'User not found via JWT id');
    else if (!foundUser.isActive) fail(4, 'User account deactivated');
    else pass(4, 'protect middleware: user found, active');

    // Simulate authorize('faculty') check
    const allowedRoles = ['faculty', 'admin', 'super_admin'];
    if (allowedRoles.includes(foundUser.role)) {
      pass(4, `authorize(['faculty','admin','super_admin']): PASSES for role="${foundUser.role}"`);
    } else {
      fail(4, `authorize would BLOCK role="${foundUser.role}"`);
    }

    // Faculty-only route: authorize('faculty')
    if (foundUser.role === 'faculty') {
      pass(4, `Faculty-only route: authorized ✓`);
    } else {
      fail(4, `Faculty-only route would block: role=${foundUser.role}`);
    }
  } catch (e) { fail(4, `JWT/auth: ${e.message}`); }

  // ────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────
  sep('CLEANUP');
  try {
    if (user) await User.deleteOne({ _id: user._id });
    if (faculty) await Faculty.deleteOne({ _id: faculty._id });
    await Class.deleteOne({ _id: cls._id });
    await Subject.deleteOne({ _id: subj._id });
    console.log('  🧹 Done');
  } catch (e) { console.log('  ⚠️  Cleanup:', e.message); }

  console.log('\n══════════════════════════════════════════════════════\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
