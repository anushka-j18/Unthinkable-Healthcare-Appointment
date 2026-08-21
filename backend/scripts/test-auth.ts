import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}/api`;

interface TestResponse {
  status: number;
  body: any;
}

async function request(
  path: string,
  method: 'GET' | 'POST',
  body?: any,
  token?: string
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting Authentication & Role-Based Middleware Tests...\n');

  // Start test server
  const server = app.listen(PORT);

  try {
    // Cleanup any pre-existing test users
    const testEmails = [
      'test.patient@healthcare.com',
      'test.doctor@healthcare.com',
      'test.admin@healthcare.com',
    ];
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    // --- TEST 1: Zod Input Validation ---
    console.log('--- Test Suite 1: Zod Input Validation ---');
    const invalidEmailRes = await request('/auth/register', 'POST', {
      email: 'invalid-email-format',
      password: 'securePassword123',
      name: 'Test Invalid',
    });
    assert(invalidEmailRes.status === 400, 'Rejects invalid email format with 400');
    assert(
      invalidEmailRes.body.error === 'Validation Error',
      'Returns Zod validation error response'
    );

    const shortPasswordRes = await request('/auth/register', 'POST', {
      email: 'valid@example.com',
      password: '123',
      name: 'Short Password',
    });
    assert(shortPasswordRes.status === 400, 'Rejects short password (< 6 chars) with 400');

    // --- TEST 2: Patient Role Registration & Auth ---
    console.log('\n--- Test Suite 2: Patient Registration & Role Authorization ---');
    const patientReg = await request('/auth/register', 'POST', {
      email: testEmails[0],
      password: 'PatientPassword123!',
      name: 'Jane Patient',
      role: 'PATIENT',
    });
    assert(patientReg.status === 201, 'Patient registration succeeds with 201 Created');
    assert(patientReg.body.user.role === 'PATIENT', 'User registered with PATIENT role');
    assert(!!patientReg.body.token, 'JWT token issued upon registration');

    const patientLogin = await request('/auth/login', 'POST', {
      email: testEmails[0],
      password: 'PatientPassword123!',
    });
    assert(patientLogin.status === 200, 'Patient login succeeds with 200 OK');
    const patientToken = patientLogin.body.token;

    // Test Patient Access
    const patientAccess = await request('/protected/patient-only', 'GET', undefined, patientToken);
    assert(patientAccess.status === 200, 'Patient can access /protected/patient-only (200 OK)');

    const patientDoctorAccess = await request('/protected/doctor-only', 'GET', undefined, patientToken);
    assert(patientDoctorAccess.status === 403, 'Patient forbidden from /protected/doctor-only (403 Forbidden)');

    const patientAdminAccess = await request('/protected/admin-only', 'GET', undefined, patientToken);
    assert(patientAdminAccess.status === 403, 'Patient forbidden from /protected/admin-only (403 Forbidden)');

    // --- TEST 3: Doctor Role Registration & Profile Creation ---
    console.log('\n--- Test Suite 3: Doctor Registration & Role Authorization ---');
    const doctorReg = await request('/auth/register', 'POST', {
      email: testEmails[1],
      password: 'DoctorPassword123!',
      name: 'Dr. John Smith',
      role: 'DOCTOR',
      specialisation: 'Cardiology',
      bio: 'Experienced cardiologist with 10+ years in clinical practice.',
    });
    assert(doctorReg.status === 201, 'Doctor registration succeeds with 201 Created');
    assert(doctorReg.body.user.role === 'DOCTOR', 'User registered with DOCTOR role');
    assert(
      doctorReg.body.user.doctorProfile?.specialisation === 'Cardiology',
      'DoctorProfile automatically created with custom specialisation'
    );
    const doctorToken = doctorReg.body.token;

    // Test Doctor Access
    const doctorAccess = await request('/protected/doctor-only', 'GET', undefined, doctorToken);
    assert(doctorAccess.status === 200, 'Doctor can access /protected/doctor-only (200 OK)');

    const doctorPatientAccess = await request('/protected/patient-only', 'GET', undefined, doctorToken);
    assert(doctorPatientAccess.status === 403, 'Doctor forbidden from /protected/patient-only (403 Forbidden)');

    const doctorClinicalAccess = await request('/protected/clinical-access', 'GET', undefined, doctorToken);
    assert(doctorClinicalAccess.status === 200, 'Doctor can access /protected/clinical-access (200 OK)');

    // --- TEST 4: Admin Role Registration & Authorization ---
    console.log('\n--- Test Suite 4: Admin Registration & Role Authorization ---');
    const adminReg = await request('/auth/register', 'POST', {
      email: testEmails[2],
      password: 'AdminPassword123!',
      name: 'Super Admin',
      role: 'ADMIN',
    });
    assert(adminReg.status === 201, 'Admin registration succeeds with 201 Created');
    assert(adminReg.body.user.role === 'ADMIN', 'User registered with ADMIN role');
    const adminToken = adminReg.body.token;

    // Test Admin Access
    const adminAccess = await request('/protected/admin-only', 'GET', undefined, adminToken);
    assert(adminAccess.status === 200, 'Admin can access /protected/admin-only (200 OK)');

    const adminClinicalAccess = await request('/protected/clinical-access', 'GET', undefined, adminToken);
    assert(adminClinicalAccess.status === 200, 'Admin can access /protected/clinical-access (200 OK)');

    // --- TEST 5: Authentication Security ---
    console.log('\n--- Test Suite 5: Security & Invalid Credentials ---');
    const wrongPassLogin = await request('/auth/login', 'POST', {
      email: testEmails[0],
      password: 'WrongPassword!',
    });
    assert(wrongPassLogin.status === 401, 'Rejects login with invalid password (401 Unauthorized)');

    const noTokenAccess = await request('/protected/patient-only', 'GET');
    assert(noTokenAccess.status === 401, 'Rejects protected route without token (401 Unauthorized)');

    const invalidTokenAccess = await request('/protected/patient-only', 'GET', undefined, 'invalid.jwt.token');
    assert(invalidTokenAccess.status === 401, 'Rejects protected route with malformed token (401 Unauthorized)');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! All 3 roles, Zod validation, JWT issuance, and RBAC verified.');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
