import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

const PORT = 5011;
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

async function runDoctorUIFlowTests() {
  console.log('🚀 Starting Doctor Dashboard UI Endpoints & Leave Calendar Tests...\n');

  const server = app.listen(PORT);

  try {
    const adminEmail = 'admin.docui@healthcare.com';
    const doctorEmail = 'dr.docui@healthcare.com';
    const patientEmail = 'patient.docui@healthcare.com';

    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, doctorEmail, patientEmail] } },
    });

    // 1. Create Admin
    const adminReg = await request('/auth/register', 'POST', {
      email: adminEmail,
      password: 'AdminPassword123!',
      name: 'Admin Dashboard',
      role: 'ADMIN',
    });
    const adminToken = adminReg.body.token;

    // 2. Create Doctor
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Gregory House',
      role: 'DOCTOR',
      specialisation: 'Diagnostic Medicine',
    });
    assert(doctorReg.status === 201, 'Doctor account registered');
    const doctorToken = doctorReg.body.token;
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    // 3. Mark a leave day as Admin
    const leaveRes = await request(
      `/admin/doctors/${doctorProfileId}/leave`,
      'POST',
      { date: '2026-09-25', reason: 'Medical Conference Speaker' },
      adminToken
    );
    assert(leaveRes.status === 201, 'Admin recorded doctor leave day');

    // --- TEST 1: GET /api/doctor/profile (Doctor Profile & Leave Calendar) ---
    console.log('--- Test Suite 1: GET /api/doctor/profile Leave Calendar ---');
    const profileRes = await request('/doctor/profile', 'GET', undefined, doctorToken);
    assert(profileRes.status === 200, 'GET /api/doctor/profile returns 200 OK');
    assert(!!profileRes.body.doctorProfile, 'doctorProfile object returned');
    assert(profileRes.body.doctorProfile.leaveDays.length >= 1, 'Doctor profile includes leaveDays array');
    assert(profileRes.body.doctorProfile.leaveDays[0].reason === 'Medical Conference Speaker', 'Leave day reason matches');

    // --- TEST 2: GET /api/doctor/appointments (Roster & Pre-Visit AI Urgency) ---
    console.log('\n--- Test Suite 2: Doctor Consultations Roster & AI Urgency ---');
    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'Jack Patient',
      role: 'PATIENT',
    });
    const patientToken = patientReg.body.token;

    const slotTime = '2026-09-24T09:00:00.000Z'; // Thursday
    await request(
      '/appointments',
      'POST',
      {
        doctorId: doctorProfileId,
        slotStartTime: slotTime,
        symptoms: 'Severe sudden chest pain radiating to back for 15 minutes.',
      },
      patientToken
    );

    const apptsRes = await request('/doctor/appointments', 'GET', undefined, doctorToken);
    assert(apptsRes.status === 200, 'GET /api/doctor/appointments returns 200 OK');
    assert(apptsRes.body.appointments.length >= 1, 'Returns appointments roster for doctor');
    const appt = apptsRes.body.appointments[0];
    assert(!!appt.symptomForm, 'Pre-visit symptom form attached');
    assert(appt.symptomForm.urgencyLevel === 'HIGH', 'HIGH urgency level surfaced clearly for chest pain');

    console.log('\n🎉 ALL DOCTOR PORTAL DASHBOARD & LEAVE CALENDAR TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runDoctorUIFlowTests().catch((err) => {
  console.error('Fatal Doctor UI Test Error:', err);
  process.exit(1);
});
