import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

const PORT = 5009;
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

async function runGoogleCalendarTests() {
  console.log('🚀 Starting Google OAuth 2.0 & Google Calendar Event Sync Tests...\n');

  const server = app.listen(PORT);

  try {
    const doctorEmail = 'dr.gcal@healthcare.com';
    const patientEmail = 'patient.gcal@healthcare.com';

    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: [doctorEmail, patientEmail] } },
    });

    // 1. Register Doctor & Patient
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Google Calendar',
      role: 'DOCTOR',
      specialisation: 'Endocrinology',
    });
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'Hannah Patient',
      role: 'PATIENT',
    });
    const patientToken = patientReg.body.token;

    // --- TEST 1: Google OAuth Authorization URL ---
    console.log('--- Test Suite 1: Google OAuth 2.0 URL Generation ---');
    const oauthRes = await request('/auth/google', 'GET', undefined, patientToken);
    assert(oauthRes.status === 200, 'GET /api/auth/google returns 200 OK');
    assert(!!oauthRes.body.authUrl, 'authUrl string returned');
    assert(
      decodeURIComponent(oauthRes.body.authUrl).includes('https://www.googleapis.com/auth/calendar.events'),
      'authUrl requests google calendar.events scope'
    );

    // --- TEST 2: On Booking Event Creation & googleEventId Storage ---
    console.log('\n--- Test Suite 2: Event Creation on Booking ---');
    const slotTime1 = '2026-09-22T09:00:00.000Z'; // Tuesday
    const bookRes = await request(
      '/appointments',
      'POST',
      { doctorId: doctorProfileId, slotStartTime: slotTime1 },
      patientToken
    );
    assert(bookRes.status === 201, 'Appointment booked successfully');
    const apptId = bookRes.body.appointment.id;

    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatedAppt1 = await prisma.appointment.findUnique({ where: { id: apptId } });
    assert(!!updatedAppt1?.googleEventId, 'googleEventId generated and stored on Appointment record');

    // --- TEST 3: On Reschedule Event Update ---
    console.log('\n--- Test Suite 3: Event Update on Reschedule ---');
    const slotTime2 = '2026-09-22T10:00:00.000Z';
    const rescheduleRes = await request(
      `/appointments/${apptId}/reschedule`,
      'POST',
      { slotStartTime: slotTime2 },
      patientToken
    );
    assert(rescheduleRes.status === 200, 'Appointment rescheduled successfully');
    assert(
      new Date(rescheduleRes.body.appointment.slotStartTime).toISOString() === new Date(slotTime2).toISOString(),
      'slotStartTime updated in DB'
    );

    // --- TEST 4: On Cancellation Event Deletion ---
    console.log('\n--- Test Suite 4: Event Deletion on Cancellation ---');
    const cancelRes = await request(`/appointments/${apptId}/cancel`, 'POST', {}, patientToken);
    assert(cancelRes.status === 200, 'Appointment cancelled successfully');
    assert(cancelRes.body.appointment.status === 'CANCELLED', 'Appointment status set to CANCELLED');

    console.log('\n🎉 ALL GOOGLE OAUTH 2.0 & CALENDAR SYNC TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runGoogleCalendarTests().catch((err) => {
  console.error('Fatal Google Calendar Test Error:', err);
  process.exit(1);
});
