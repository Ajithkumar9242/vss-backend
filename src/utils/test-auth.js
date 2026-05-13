/**
 * Phase 2 — Self-Validation Test Script
 * Tests all auth endpoints and module health checks.
 * Run: node src/utils/test-auth.js
 */
const http = require('http');

const BASE = 'http://localhost:5000';
let passCount = 0;
let failCount = 0;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
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
  console.log('\n═══════════════════════════════════════════════');
  console.log('  VMS School ERP — Phase 2 Validation Tests');
  console.log('═══════════════════════════════════════════════\n');

  // ─── TEST 1: Health Check ────────────────────────────────
  console.log('📋 Test Group 1: Health Check');
  try {
    const r = await request('GET', '/api/health');
    assert('API health returns 200', r.status === 200);
    assert('Health response has success: true', r.body.success === true);
  } catch (e) {
    assert('API health endpoint reachable', false, e.message);
  }

  // ─── TEST 2: Login Validation (missing fields) ──────────
  console.log('\n📋 Test Group 2: Login Validation');
  try {
    const r = await request('POST', '/api/auth/login', {});
    assert('Empty body returns 400', r.status === 400);
    assert('Empty body returns success: false', r.body.success === false);
  } catch (e) {
    assert('Validation reachable', false, e.message);
  }

  try {
    const r = await request('POST', '/api/auth/login', { email: 'admin@vms.com' });
    assert('Missing password returns 400', r.status === 400);
  } catch (e) {
    assert('Missing password validation', false, e.message);
  }

  // ─── TEST 3: Login with wrong password ──────────────────
  console.log('\n📋 Test Group 3: Invalid Login');
  try {
    const r = await request('POST', '/api/auth/login', {
      email: 'admin@vms.com',
      password: 'WrongPassword123',
    });
    assert('Wrong password returns 401', r.status === 401);
    assert('Wrong password returns success: false', r.body.success === false);
    assert('Error message is generic (no info leak)', r.body.message === 'Invalid email or password');
  } catch (e) {
    assert('Invalid login test', false, e.message);
  }

  // ─── TEST 4: Login with non-existent user ───────────────
  try {
    const r = await request('POST', '/api/auth/login', {
      email: 'nobody@vms.com',
      password: 'Admin@123',
    });
    assert('Non-existent user returns 401', r.status === 401);
  } catch (e) {
    assert('Non-existent user test', false, e.message);
  }

  // ─── TEST 5: Successful Login ───────────────────────────
  console.log('\n📋 Test Group 4: Successful Login');
  let token = null;
  try {
    const r = await request('POST', '/api/auth/login', {
      email: 'admin@vms.com',
      password: 'Admin@123',
    });
    assert('Valid login returns 200', r.status === 200);
    assert('Login returns success: true', r.body.success === true);
    assert('Login returns user object', r.body.data && r.body.data.user != null);
    assert('Login returns token', r.body.data && typeof r.body.data.token === 'string');
    assert('User has email field', r.body.data?.user?.email === 'admin@vms.com');
    assert('User has role field', r.body.data?.user?.role === 'superadmin');
    assert('Password NOT in response', r.body.data?.user?.password === undefined);
    assert('User has name field', r.body.data?.user?.name === 'Super Admin');

    token = r.body.data?.token;

    // Decode JWT to check payload
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      assert('JWT contains id', typeof payload.id === 'string');
      assert('JWT contains role', payload.role === 'superadmin');
      assert('JWT has expiry (exp)', typeof payload.exp === 'number');
      assert('JWT has issued-at (iat)', typeof payload.iat === 'number');
    }
  } catch (e) {
    assert('Successful login test', false, e.message);
  }

  // ─── TEST 6: GET /me without token ──────────────────────
  console.log('\n📋 Test Group 5: GET /me (Protected Route)');
  try {
    const r = await request('GET', '/api/auth/me');
    assert('/me without token returns 401', r.status === 401);
    assert('/me without token returns success: false', r.body.success === false);
  } catch (e) {
    assert('/me without token', false, e.message);
  }

  // ─── TEST 7: GET /me with valid token ───────────────────
  if (token) {
    try {
      const r = await request('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${token}`,
      });
      assert('/me with token returns 200', r.status === 200);
      assert('/me returns user data', r.body.data?.user != null);
      assert('/me user matches login user', r.body.data?.user?.email === 'admin@vms.com');
      assert('/me password NOT exposed', r.body.data?.user?.password === undefined);
    } catch (e) {
      assert('/me with token', false, e.message);
    }
  }

  // ─── TEST 8: GET /me with invalid token ─────────────────
  try {
    const r = await request('GET', '/api/auth/me', null, {
      Authorization: 'Bearer invalidtoken123',
    });
    assert('/me with bad token returns 401', r.status === 401);
  } catch (e) {
    assert('/me with bad token', false, e.message);
  }

  // ─── TEST 9: Module Health Checks ───────────────────────
  console.log('\n📋 Test Group 6: Module Health Checks');
  const modules = [
    { path: '/api/admissions/health', name: 'Admission' },
    { path: '/api/students/health', name: 'Student' },
    { path: '/api/school/health', name: 'School' },
    { path: '/api/faculty/health', name: 'Faculty' },
    { path: '/api/attendance/health', name: 'Attendance' },
    { path: '/api/exams/health', name: 'Exam' },
    { path: '/api/fees/health', name: 'Fees' },
  ];

  for (const mod of modules) {
    try {
      const r = await request('GET', mod.path);
      assert(`${mod.name} health returns 200`, r.status === 200);
    } catch (e) {
      assert(`${mod.name} health`, false, e.message);
    }
  }

  // ─── SUMMARY ────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════\n');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
