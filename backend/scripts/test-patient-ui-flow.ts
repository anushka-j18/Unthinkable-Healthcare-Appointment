import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

const PORT = 5010;
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

async function runPatientUIFlowTests() {
  console.log('🚀 Starting Patient Portal UI Endpoints & History Verification Tests...\n');

  const server = app.listen(PORT);

  try {
    const doctorEmail = 'dr.patientui@healthcare.com';
    const patientEmail = 'patient.patientui@healthcare.com';

    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: [doctorEmail, patientEmail] } },
    });

    // 1. Create Doctor Profile
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Patient UI Specialist',
      role: 'DOCTOR',
      specialisation: 'General Medicine',
    });
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    // 2. Register Patient
    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'Ian Patient',
      role: 'PATIENT',
    });
    assert(patientReg.status === 201, 'Patient account registered');
    const patientToken = patientReg.body.token;

    // --- TEST 1: Book Appointment with Symptom Questionnaire ---
    console.log('--- Test Suite 1: Booking with Pre-Visit Symptoms ---');
    const slotTime = '2026-09-23T09:00:00.000Z'; // Wednesday
    const bookRes = await request(
      '/appointments',
      'POST',
      {
        doctorId: doctorProfileId,
        slotStartTime: slotTime,
        symptoms: 'Persistent dry cough and low-grade fever for 3 days.',
      },
      patientToken
    );
    assert(bookRes.status === 201, 'Appointment booked successfully');
    const apptId = bookRes.body.appointment.id;

    // --- TEST 2: GET /api/appointments/my (Patient History) ---
    console.log('\n--- Test Suite 2: GET /api/appointments/my Patient History ---');
    const myApptsRes = await request('/appointments/my', 'GET', undefined, patientToken);
    assert(myApptsRes.status === 200, 'GET /api/appointments/my returns 200 OK');
    assert(myApptsRes.body.appointments.length >= 1, 'Returns patient appointment history');
    const fetchedAppt = myApptsRes.body.appointments[0];
    assert(fetchedAppt.id === apptId, 'Fetched appointment ID matches booked appointment');
    assert(!!fetchedAppt.symptomForm, 'Pre-visit symptom form attached to history object');

    console.log('\n🎉 ALL PATIENT PORTAL UI & ENDPOINT TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPatientUIFlowTests().catch((err) => {
  console.error('Fatal Patient UI Test Error:', err);
  process.exit(1);
});
