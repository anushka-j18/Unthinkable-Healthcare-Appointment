import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { Role } from '@prisma/client';

const PORT = 5004;
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

async function runConcurrencyTests() {
  console.log('🚀 Starting Doctor Search, Slot Calculation & Concurrency Safety Tests...\n');

  const server = app.listen(PORT);

  try {
    const doctorEmail = 'dr.neurology@healthcare.com';
    const patientEmails = Array.from({ length: 10 }, (_, i) => `patient.concurrent${i + 1}@healthcare.com`);

    // Cleanup existing test data
    await prisma.user.deleteMany({
      where: { email: { in: [doctorEmail, ...patientEmails] } },
    });

    // 1. Create Doctor Profile (Neurology)
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Gregory House',
      role: 'DOCTOR',
      specialisation: 'Neurology',
      slotDurationMinutes: 30,
      workingHours: {
        tuesday: { start: '09:00', end: '17:00' },
      },
    });
    assert(doctorReg.status === 201, 'Doctor created with Neurology specialisation');
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    // 2. Register 10 test patients
    const patientTokens: string[] = [];
    for (let i = 0; i < 10; i++) {
      const reg = await request('/auth/register', 'POST', {
        email: patientEmails[i],
        password: 'PatientPassword123!',
        name: `Patient ${i + 1}`,
        role: 'PATIENT',
      });
      patientTokens.push(reg.body.token);
    }
    assert(patientTokens.length === 10, '10 concurrent test patient accounts registered');

    // --- TEST 1: GET /doctors?specialisation=Neurology ---
    console.log('\n--- Test Suite 1: GET /doctors?specialisation=Neurology ---');
    const searchRes = await request('/doctors?specialisation=Neurology', 'GET');
    assert(searchRes.status === 200, 'Search doctors endpoint returns 200 OK');
    assert(searchRes.body.doctors.length >= 1, 'Found at least 1 Neurology doctor');
    assert(
      searchRes.body.doctors.some((d: any) => d.doctorProfile?.specialisation === 'Neurology'),
      'Search filters correctly by specialisation'
    );

    // --- TEST 2: GET /doctors/:id/slots?date=2026-09-15 ---
    console.log('\n--- Test Suite 2: GET /doctors/:id/slots?date=2026-09-15 ---');
    // 2026-09-15 is a Tuesday
    const slotsRes = await request(`/doctors/${doctorProfileId}/slots?date=2026-09-15`, 'GET');
    assert(slotsRes.status === 200, 'Slots endpoint returns 200 OK');
    assert(slotsRes.body.isWorkingDay === true, 'Correctly identifies Tuesday as a working day');
    assert(slotsRes.body.slots.length > 0, 'Generates time slots for doctor working hours');
    const targetSlotStartTime = slotsRes.body.slots[0].slotStartTime;

    // --- TEST 3: Simultaneous Concurrency Booking Test ---
    console.log('\n--- Test Suite 3: Simultaneous Concurrency Safety Test (10 Concurrent Requests) ---');
    console.log(`⚡ Hitting POST /appointments simultaneously for slotStartTime: ${targetSlotStartTime}...`);

    // Fire 10 simultaneous POST /appointments requests for the EXACT SAME slot
    const concurrentRequests = patientTokens.map((token) =>
      request(
        '/appointments',
        'POST',
        {
          doctorId: doctorProfileId,
          slotStartTime: targetSlotStartTime,
        },
        token
      )
    );

    const results = await Promise.all(concurrentRequests);

    const successResponses = results.filter((r) => r.status === 201);
    const conflictResponses = results.filter((r) => r.status === 409);

    assert(
      successResponses.length === 1,
      `EXACTLY 1 booking succeeded (201 Created). Actual: ${successResponses.length}`
    );
    assert(
      conflictResponses.length === 9,
      `EXACTLY 9 concurrent attempts rejected with 409 Conflict. Actual: ${conflictResponses.length}`
    );
    assert(
      conflictResponses.every((r) => r.body.message.includes('no longer available')),
      'All 9 rejected requests returned user-friendly "slot no longer available" error message'
    );

    // Verify slot status after booking
    const updatedSlotsRes = await request(`/doctors/${doctorProfileId}/slots?date=2026-09-15`, 'GET');
    const bookedSlot = updatedSlotsRes.body.slots.find((s: any) => s.slotStartTime === targetSlotStartTime);
    assert(bookedSlot.isAvailable === false, 'Slot availability correctly updated to false after booking');

    console.log('\n🎉 ALL DOCTOR SEARCH, SLOT CALCULATION & CONCURRENCY TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runConcurrencyTests().catch((err) => {
  console.error('Fatal Concurrency Test Execution Error:', err);
  process.exit(1);
});
