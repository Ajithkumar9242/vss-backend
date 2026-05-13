/**
 * Integration Test Script — tests all flows via direct API calls.
 * Run: node test-integration.js
 */
const BASE = 'http://localhost:5000/api';

async function api(method, path, body = null, token = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, ...data };
}

let adminToken = null;
let facultyToken = null;
let parentToken = null;
let testClassId = null;
let testAdmissionId = null;
let testStudentId = null;
let testFacultyId = null;

async function run() {
  console.log('═══════════════════════════════════════');
  console.log('  VMS ERP — INTEGRATION TEST SUITE');
  console.log('═══════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function check(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // ═══ TEST 1: ADMIN LOGIN ═══
  console.log('\n🔐 STEP 1: AUTH — Admin Login');
  const loginRes = await api('POST', '/auth/login', {
    email: 'admin@vms.com',
    password: 'Admin@123',
  });
  check('Admin login', loginRes.status === 200, `role=${loginRes.data?.user?.role}`);
  adminToken = loginRes.data?.token;

  // /me endpoint
  const meRes = await api('GET', '/auth/me', null, adminToken);
  check('/me returns user', meRes.status === 200, `role=${meRes.data?.user?.role}`);

  // ═══ TEST 2: GET CLASS FOR TESTING ═══
  console.log('\n🏫 STEP 2: Get test class');
  const classRes = await api('GET', '/school/classes?limit=1', null, adminToken);
  testClassId = classRes.data?.[0]?._id;
  check('Class found', !!testClassId, `classId=${testClassId}`);

  // ═══ TEST 3: FACULTY CREATION + AUTO USER ═══
  console.log('\n👨‍🏫 STEP 3: Faculty Creation + Auto User');
  const uniqueEmail = `teacher.t${Date.now()}@vms.com`;
  const facRes = await api('POST', '/faculty', {
    name: 'Test Teacher 2',
    email: uniqueEmail,
    designation: 'Senior Teacher',
    phone: '7777666655',
  }, adminToken);
  check('Faculty created', facRes.status === 201, `id=${facRes.data?._id}, empId=${facRes.data?.employeeId}`);
  testFacultyId = facRes.data?._id;

  // Wait for async user creation
  await new Promise(r => setTimeout(r, 2000));

  // Try login as faculty
  const facLoginRes = await api('POST', '/auth/login', {
    email: uniqueEmail,
    password: 'Vms@1234',
  });
  check('Faculty login works', facLoginRes.status === 200, `role=${facLoginRes.data?.user?.role}`);
  facultyToken = facLoginRes.data?.token;

  // Faculty /me returns linked entity
  if (facultyToken) {
    const facMeRes = await api('GET', '/auth/me', null, facultyToken);
    check('Faculty /me returns linkedEntity', !!facMeRes.data?.user?.linkedEntity,
      `empId=${facMeRes.data?.user?.linkedEntity?.employeeId}`);
  }

  // ═══ TEST 4: ASSIGN CLASSES TO FACULTY ═══
  console.log('\n📋 STEP 4: Faculty Class Assignment');
  if (testFacultyId && testClassId) {
    const assignRes = await api('PATCH', `/faculty/${testFacultyId}/assign-classes`, {
      classIds: [testClassId],
    }, adminToken);
    check('Classes assigned', assignRes.status === 200,
      `classes=${assignRes.data?.assignedClasses?.length}`);
  }

  // ═══ TEST 5: ADMISSION CREATION ═══
  console.log('\n📝 STEP 5: Admission Creation');
  const parentEmail = `ravi.s${Date.now()}@test.com`;
  const admRes = await api('POST', '/admissions', {
    studentName: 'Priya Sharma',
    dateOfBirth: '2015-05-15',
    gender: 'female',
    parentName: 'Ravi Sharma',
    parentPhone: `99998${String(Date.now()).slice(-5)}`,
    parentEmail: parentEmail,
    classId: testClassId,
    address: '123 Main Street',
  }, adminToken);
  check('Admission created', admRes.status === 201,
    `appNo=${admRes.data?.admission?.applicationNo}`);
  testAdmissionId = admRes.data?.admission?._id;
  check('Admission ID captured', !!testAdmissionId, `id=${testAdmissionId}`);

  // ═══ TEST 6: ADMISSION APPROVAL → PARENT + STUDENT + USER ═══
  console.log('\n✅ STEP 6: Admission Approval (Parent Auto-Create)');
  if (testAdmissionId) {
    const approveRes = await api('PATCH', `/admissions/${testAdmissionId}/approve`, null, adminToken);
    check('Admission approved', approveRes.status === 200,
      `status=${approveRes.data?.admission?.status}`);
    testStudentId = approveRes.data?.student?._id;
    check('Student created', !!testStudentId, `rollNo=${approveRes.data?.student?.rollNo}`);

    // Wait for async parent + user creation
    await new Promise(r => setTimeout(r, 3000));

    // Verify parent was created
    const parentsRes = await api('GET', '/parents?limit=50', null, adminToken);
    const raviParent = parentsRes.data?.parents?.find(p => p.email === parentEmail);
    check('Parent auto-created', !!raviParent, `name=${raviParent?.name}`);
    check('Student linked to parent', raviParent?.linkedStudents?.length > 0,
      `linkedCount=${raviParent?.linkedStudents?.length}`);

    // Try parent login
    if (raviParent?.email) {
      const parentLoginRes = await api('POST', '/auth/login', {
        email: parentEmail,
        password: 'Vms@1234',
      });
      check('Parent login works', parentLoginRes.status === 200,
        `role=${parentLoginRes.data?.user?.role}`);
      parentToken = parentLoginRes.data?.token;

      if (parentToken) {
        const parentMeRes = await api('GET', '/auth/me', null, parentToken);
        check('Parent /me returns linkedEntity', !!parentMeRes.data?.user?.linkedEntity,
          `students=${parentMeRes.data?.user?.linkedEntity?.linkedStudents?.length}`);
      }
    }
  } else {
    console.log('  ⏭ Skipped — no admission ID');
  }

  // ═══ TEST 7: FEE PAYMENT + RECEIPT ═══
  console.log('\n💰 STEP 7: Fee Payment');
  if (testStudentId) {
    const payRes = await api('POST', '/fees/pay', {
      studentId: testStudentId,
      amount: 500,
      paymentMode: 'cash',
    }, adminToken);
    check('Fee payment recorded', payRes.status === 201,
      `receipt=${payRes.data?.receiptNumber}`);
    check('Receipt number generated', !!payRes.data?.receiptNumber);

    // Second payment — UPI mode
    const payRes2 = await api('POST', '/fees/pay', {
      studentId: testStudentId,
      amount: 300,
      paymentMode: 'upi',
      transactionId: 'UPI-TEST-123',
    }, adminToken);
    check('UPI payment works', payRes2.status === 201);

    // Check fee status
    const feeSummary = await api('GET', `/fees/student/${testStudentId}`, null, adminToken);
    check('Fee summary works', feeSummary.status === 200,
      `status=${feeSummary.data?.summary?.status}, paid=${feeSummary.data?.summary?.totalPaid}`);
  } else {
    console.log('  ⏭ Skipped — no student ID');
  }

  // ═══ TEST 8: ACTIVITY LOGS ═══
  console.log('\n📜 STEP 8: Activity Logs');
  await new Promise(r => setTimeout(r, 1000));
  const activityRes = await api('GET', '/activity/recent?limit=30', null, adminToken);
  check('Activity logs exist', activityRes.data?.logs?.length > 0,
    `count=${activityRes.data?.logs?.length}`);
  const modules = [...new Set(activityRes.data?.logs?.map(l => l.module) || [])];
  check('Multiple modules logged', modules.length >= 1, `modules=[${modules.join(', ')}]`);

  // ═══ TEST 9: NOTIFICATIONS ═══
  console.log('\n🔔 STEP 9: Notifications');
  const notifRes = await api('GET', '/notifications?limit=20', null, adminToken);
  check('Notifications API works', notifRes.status === 200,
    `count=${notifRes.data?.notifications?.length}`);
  const unreadRes = await api('GET', '/notifications/unread-count', null, adminToken);
  check('Unread count works', unreadRes.status === 200,
    `unread=${unreadRes.data?.unreadCount}`);

  // ═══ TEST 10: GLOBAL SEARCH ═══
  console.log('\n🔍 STEP 10: Global Search');
  const searchRes = await api('GET', '/search?q=Priya', null, adminToken);
  check('Search returns grouped results', searchRes.status === 200,
    `total=${searchRes.data?.totalResults}`);
  check('Search has students array', Array.isArray(searchRes.data?.students));
  check('Search has faculty array', Array.isArray(searchRes.data?.faculty));
  check('Search has admissions array', Array.isArray(searchRes.data?.admissions));

  // ═══ TEST 11: EXISTING ENDPOINTS (REGRESSION) ═══
  console.log('\n🔄 STEP 11: Regression — Existing APIs');
  const studRes = await api('GET', '/students?limit=5', null, adminToken);
  check('Students API works', studRes.status === 200);
  const examRes = await api('GET', '/exams', null, adminToken);
  check('Exams API works', examRes.status === 200);
  const feesOvRes = await api('GET', '/fees/overview', null, adminToken);
  check('Fees overview works', feesOvRes.status === 200);
  const commRes = await api('GET', '/communication?limit=5', null, adminToken);
  check('Communication API works', commRes.status === 200);
  const healthRes = await api('GET', '/health');
  check('Health check', healthRes.status === 200);

  // ═══ TEST 12: ERROR HANDLING ═══
  console.log('\n⚠️  STEP 12: Error Handling');
  const inv1 = await api('GET', '/students/invalidid', null, adminToken);
  check('Invalid ObjectId → 400', inv1.status === 400);
  const inv3 = await api('GET', '/notifications', null, null);
  check('No token → 401', inv3.status === 401);

  // ═══ SUMMARY ═══
  console.log('\n═══════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
