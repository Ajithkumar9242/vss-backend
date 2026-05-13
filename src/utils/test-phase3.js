/**
 * Phase 3 — Self-Validation Test Script
 * Tests School, Admission, and Student modules with real DB operations.
 * Requires: server running on port 5000 with seeded data.
 * Run: node src/utils/test-phase3.js
 */
const http = require('http');

const BASE = 'http://localhost:5000';
let passCount = 0;
let failCount = 0;
let TOKEN = null;

// ─── Tracked IDs for relationship testing ───────────────────
let createdClassId = null;
let createdSectionId = null;
let createdSubjectId = null;
let createdAdmissionId = null;
let createdStudentId = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authRequest(method, path, body = null) {
  return request(method, path, body, { Authorization: `Bearer ${TOKEN}` });
}

function assert(testName, condition, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  ❌ FAIL: ${testName} ${details}`);
    failCount++;
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VMS School ERP — Phase 3 Validation Tests');
  console.log('  (School Setup, Admission, Student — Real DB Ops)');
  console.log('═══════════════════════════════════════════════════════\n');

  // ─── Step 0: Login to get token ───────────────────────────
  console.log('🔐 Step 0: Authenticate');
  try {
    const r = await request('POST', '/api/auth/login', {
      email: 'admin@vms.com',
      password: 'Admin@123',
    });
    assert('Login succeeds', r.status === 200 && r.body.success);
    TOKEN = r.body.data?.token;
    assert('Token received', !!TOKEN);
  } catch (e) {
    console.error('FATAL: Cannot login. Aborting tests.', e.message);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════
  //  1. SCHOOL MODULE — CLASSES
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 1. School Module — Classes');

  // 1a. Get existing classes (from seed)
  {
    const r = await authRequest('GET', '/api/school/classes');
    assert('GET /classes returns 200', r.status === 200);
    assert('Seeded classes exist', r.body.data?.length >= 12);
  }

  // 1b. Create a new class
  {
    const r = await authRequest('POST', '/api/school/classes', {
      name: 'Test Class',
      code: 'TESTCLS',
      description: 'Auto-test class',
      order: 99,
    });
    assert('POST /classes creates class (201)', r.status === 201);
    assert('Created class has name', r.body.data?.class?.name === 'Test Class');
    assert('Created class has code', r.body.data?.class?.code === 'TESTCLS');
    createdClassId = r.body.data?.class?._id;
    assert('Created class has _id', !!createdClassId);
  }

  // 1c. Duplicate class code rejected
  {
    const r = await authRequest('POST', '/api/school/classes', {
      name: 'Duplicate Test',
      code: 'TESTCLS',
    });
    assert('Duplicate class code returns 400', r.status === 400);
  }

  // 1d. Validation — missing name
  {
    const r = await authRequest('POST', '/api/school/classes', { code: 'X' });
    assert('Missing class name returns 400', r.status === 400);
  }

  // ═══════════════════════════════════════════════════════════
  //  2. SCHOOL MODULE — SECTIONS
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 2. School Module — Sections');

  // 2a. Create section for the test class
  {
    const r = await authRequest('POST', '/api/school/sections', {
      name: 'Z',
      classId: createdClassId,
      capacity: 30,
    });
    assert('POST /sections creates section (201)', r.status === 201);
    assert('Section has populated class', r.body.data?.section?.classId?.name === 'Test Class');
    createdSectionId = r.body.data?.section?._id;
    assert('Section has _id', !!createdSectionId);
  }

  // 2b. Duplicate section in same class rejected
  {
    const r = await authRequest('POST', '/api/school/sections', {
      name: 'Z',
      classId: createdClassId,
    });
    assert('Duplicate section in same class returns 400', r.status === 400);
  }

  // 2c. Get sections filtered by classId
  {
    const r = await authRequest('GET', `/api/school/sections?classId=${createdClassId}`);
    assert('GET /sections?classId returns 200', r.status === 200);
    assert('Filtered sections returned', r.body.data?.length === 1);
  }

  // 2d. Section with invalid classId
  {
    const r = await authRequest('POST', '/api/school/sections', {
      name: 'A',
      classId: '000000000000000000000000',
    });
    assert('Section with non-existent class returns 404', r.status === 404);
  }

  // ═══════════════════════════════════════════════════════════
  //  3. SCHOOL MODULE — SUBJECTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 3. School Module — Subjects');

  // 3a. Create a subject
  {
    const r = await authRequest('POST', '/api/school/subjects', {
      name: 'Test Subject',
      code: 'TESTSUB',
      type: 'theory',
    });
    assert('POST /subjects creates subject (201)', r.status === 201);
    assert('Subject has name', r.body.data?.subject?.name === 'Test Subject');
    createdSubjectId = r.body.data?.subject?._id;
    assert('Subject has _id', !!createdSubjectId);
  }

  // 3b. Duplicate subject code rejected
  {
    const r = await authRequest('POST', '/api/school/subjects', {
      name: 'Dup',
      code: 'TESTSUB',
    });
    assert('Duplicate subject code returns 400', r.status === 400);
  }

  // 3c. Get subjects by type
  {
    const r = await authRequest('GET', '/api/school/subjects?type=theory');
    assert('GET /subjects?type=theory returns 200', r.status === 200);
    assert('Filtered subjects returned', r.body.data?.length > 0);
  }

  // ═══════════════════════════════════════════════════════════
  //  4. ADMISSION MODULE
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 4. Admission Module');

  // 4a. Create admission
  {
    const r = await authRequest('POST', '/api/admissions', {
      studentName: 'Test Student',
      dateOfBirth: '2015-06-15',
      gender: 'male',
      classId: createdClassId,
      sectionId: createdSectionId,
      parentName: 'Test Parent',
      parentPhone: '9876543210',
      parentEmail: 'parent@test.com',
      address: '123 Test Street',
      previousSchool: 'Old School',
    });
    assert('POST /admissions creates admission (201)', r.status === 201);
    assert('Has applicationNo (auto-generated)', !!r.body.data?.admission?.applicationNo);
    assert('applicationNo starts with APP-', r.body.data?.admission?.applicationNo?.startsWith('APP-'));
    assert('Status is pending', r.body.data?.admission?.status === 'pending');
    assert('ClassId is populated', r.body.data?.admission?.classId?.name === 'Test Class');
    createdAdmissionId = r.body.data?.admission?._id;
    assert('Admission has _id', !!createdAdmissionId);
  }

  // 4b. Validation — missing required fields
  {
    const r = await authRequest('POST', '/api/admissions', { studentName: 'Only Name' });
    assert('Missing required fields returns 400', r.status === 400);
  }

  // 4c. Get all admissions
  {
    const r = await authRequest('GET', '/api/admissions');
    assert('GET /admissions returns 200', r.status === 200);
    assert('Admissions list has items', r.body.data?.length > 0);
  }

  // 4d. Get admissions filtered by status
  {
    const r = await authRequest('GET', '/api/admissions?status=pending');
    assert('GET /admissions?status=pending returns 200', r.status === 200);
    assert('Pending admissions exist', r.body.data?.length > 0);
  }

  // 4e. Get admission by ID
  {
    const r = await authRequest('GET', `/api/admissions/${createdAdmissionId}`);
    assert('GET /admissions/:id returns 200', r.status === 200);
    assert('Admission data matches', r.body.data?.admission?.studentName === 'Test Student');
  }

  // ═══════════════════════════════════════════════════════════
  //  5. APPROVE ADMISSION (CRITICAL FLOW)
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 5. Approve Admission (Critical Flow)');

  // 5a. Approve the admission
  {
    const r = await authRequest('PATCH', `/api/admissions/${createdAdmissionId}/approve`);
    assert('PATCH approve returns 200', r.status === 200);
    assert('Admission status is now approved', r.body.data?.admission?.status === 'approved');
    assert('Student was created', !!r.body.data?.student);
    assert('Student has rollNo', !!r.body.data?.student?.rollNo);
    assert('Student name matches admission', r.body.data?.student?.name === 'Test Student');
    assert('Student classId populated', r.body.data?.student?.classId?.name === 'Test Class');
    assert('Admission linked to student', !!r.body.data?.admission?.studentId);
    assert('approvedBy is set', !!r.body.data?.admission?.approvedBy);
    assert('approvedAt is set', !!r.body.data?.admission?.approvedAt);
    createdStudentId = r.body.data?.student?._id;
  }

  // 5b. Double-approval prevention
  {
    const r = await authRequest('PATCH', `/api/admissions/${createdAdmissionId}/approve`);
    assert('Double approval returns 400', r.status === 400);
    assert('Error says already approved', r.body.message?.includes('already been approved'));
  }

  // ═══════════════════════════════════════════════════════════
  //  6. REJECT ADMISSION (test with new admission)
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 6. Reject Admission');

  let rejectAdmissionId = null;
  {
    const r = await authRequest('POST', '/api/admissions', {
      studentName: 'Rejected Student',
      dateOfBirth: '2016-01-01',
      gender: 'female',
      classId: createdClassId,
      parentName: 'Reject Parent',
      parentPhone: '1111111111',
    });
    rejectAdmissionId = r.body.data?.admission?._id;
  }

  {
    const r = await authRequest('PATCH', `/api/admissions/${rejectAdmissionId}/reject`, {
      remarks: 'Incomplete documents',
    });
    assert('PATCH reject returns 200', r.status === 200);
    assert('Status is rejected', r.body.data?.admission?.status === 'rejected');
    assert('Remarks saved', r.body.data?.admission?.remarks === 'Incomplete documents');
  }

  // 6b. Cannot approve a rejected admission
  {
    const r = await authRequest('PATCH', `/api/admissions/${rejectAdmissionId}/approve`);
    assert('Cannot approve rejected admission (400)', r.status === 400);
  }

  // ═══════════════════════════════════════════════════════════
  //  7. STUDENT MODULE
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 7. Student Module');

  // 7a. Get all students
  {
    const r = await authRequest('GET', '/api/students');
    assert('GET /students returns 200', r.status === 200);
    assert('Students list has items', r.body.data?.length > 0);
  }

  // 7b. Get student by ID
  if (createdStudentId) {
    const r = await authRequest('GET', `/api/students/${createdStudentId}`);
    assert('GET /students/:id returns 200', r.status === 200);
    assert('Student name correct', r.body.data?.student?.name === 'Test Student');
    assert('Student has rollNo', !!r.body.data?.student?.rollNo);
    assert('Student classId populated', r.body.data?.student?.classId?.name === 'Test Class');
    assert('Student sectionId populated', r.body.data?.student?.sectionId?.name === 'Z');
    assert('Student admissionId populated', !!r.body.data?.student?.admissionId?.applicationNo);
  }

  // 7c. Filter students by classId
  {
    const r = await authRequest('GET', `/api/students?classId=${createdClassId}`);
    assert('GET /students?classId returns filtered results', r.status === 200 && r.body.data?.length > 0);
  }

  // 7d. Search students by name
  {
    const r = await authRequest('GET', '/api/students?search=Test');
    assert('GET /students?search=Test returns results', r.status === 200 && r.body.data?.length > 0);
  }

  // 7e. Non-existent student
  {
    const r = await authRequest('GET', '/api/students/000000000000000000000000');
    assert('Non-existent student returns 404', r.status === 404);
  }

  // ═══════════════════════════════════════════════════════════
  //  8. AUTH GUARD TESTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n📋 8. Auth Guard on Protected Routes');

  {
    const r = await request('GET', '/api/school/classes');
    assert('School classes without token returns 401', r.status === 401);
  }
  {
    const r = await request('GET', '/api/admissions');
    assert('Admissions without token returns 401', r.status === 401);
  }
  {
    const r = await request('GET', '/api/students');
    assert('Students without token returns 401', r.status === 401);
  }

  // ═══════════════════════════════════════════════════════════
  //  CLEANUP — remove test data
  // ═══════════════════════════════════════════════════════════
  // Note: Not cleaning up so you can inspect in MongoDB Atlas

  // ─── SUMMARY ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
