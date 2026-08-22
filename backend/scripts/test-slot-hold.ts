import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { Role } from '@prisma/client';

const PORT = 5008;
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
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runSlotHoldTests() {
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`🚀 Test server listening on ${BASE_URL}`);
      resolve();
    });
  });

  try {
    console.log('\n🚀 Starting Transient 5-Minute Slot Hold Test Suite...\n');

    // 1. Setup Patient A and Patient B accounts
    const patientAEmail = `patient_hold_a_${Date.now()}@example.com`;
    const patientBEmail = `patient_hold_b_${Date.now()}@example.com`;
    const password = 'Password123!';

    const regARes = await request('/auth/register', 'POST', {
      email: patientAEmail,
      password,
      name: 'Patient A Hold Test',
      role: 'PATIENT',
    });
    assert(regARes.status === 201, 'Patient A registered successfully');
    const tokenA = regARes.body.token;

    const regBRes = await request('/auth/register', 'POST', {
      email: patientBEmail,
      password,
      name: 'Patient B Hold Test',
      role: 'PATIENT',
    });
    assert(regBRes.status === 201, 'Patient B registered successfully');
    const tokenB = regBRes.body.token;

    // 2. Setup Doctor
    const docEmail = `doctor_hold_${Date.now()}@example.com`;
    const docUser = await prisma.user.create({
      data: {
        email: docEmail,
        passwordHash: 'hashedpassword',
        name: 'Dr. Slot Hold Tester',
        role: Role.DOCTOR,
        doctorProfile: {
          create: {
            specialisation: 'Cardiology',
            slotDurationMinutes: 30,
            workingHours: {
              monday: { start: '09:00', end: '17:00' },
              tuesday: { start: '09:00', end: '17:00' },
              wednesday: { start: '09:00', end: '17:00' },
              thursday: { start: '09:00', end: '17:00' },
              friday: { start: '09:00', end: '17:00' },
            },
          },
        },
      },
      include: { doctorProfile: true },
    });
    const doctorId = docUser.doctorProfile!.id;

    // Define target slot time (Tomorrow at 10:00 AM)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(10, 0, 0, 0);
    const slotStartTimeStr = targetDate.toISOString();

    // 3. Test Suite 1: Patient A acquires 5-minute slot hold
    console.log('--- Test Suite 1: Patient A Slot Hold Acquisition ---');
    const holdARes = await request('/appointments/hold', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
    }, tokenA);

    assert(holdARes.status === 201, 'Patient A successfully acquires 5-minute slot hold (201 Created)');
    assert(!!holdARes.body.hold.expiresAt, 'Hold response includes expiresAt timestamp');

    // 4. Test Suite 2: Patient B attempted hold & booking rejection
    console.log('\n--- Test Suite 2: Patient B Conflict Rejection ---');
    const holdBRes = await request('/appointments/hold', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
    }, tokenB);

    assert(holdBRes.status === 409, 'Patient B hold request rejected with 409 Conflict');

    const bookBRes = await request('/appointments', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
      symptoms: 'Patient B trying to steal held slot',
    }, tokenB);

    assert(bookBRes.status === 409, 'Patient B direct booking rejected with 409 Conflict');

    // 5. Test Suite 3: Patient A releases hold
    console.log('\n--- Test Suite 3: Release Hold & Re-acquisition ---');
    const releaseARes = await request('/appointments/release-hold', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
    }, tokenA);

    assert(releaseARes.status === 200, 'Patient A successfully releases slot hold (200 OK)');
    assert(releaseARes.body.released === true, 'Released flag is true');

    // 6. Test Suite 4: Patient B can now hold and book the slot
    console.log('\n--- Test Suite 4: Patient B Successful Hold & Booking ---');
    const holdBRetryRes = await request('/appointments/hold', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
    }, tokenB);

    assert(holdBRetryRes.status === 201, 'Patient B can now hold slot after Patient A released it');

    const bookBRetryRes = await request('/appointments', 'POST', {
      doctorId,
      slotStartTime: slotStartTimeStr,
      symptoms: 'Patient B booking after acquiring hold',
    }, tokenB);

    assert(bookBRetryRes.status === 201, 'Patient B successfully completes booking and releases hold');

    console.log('\n🎉 ALL TRANSIENT SLOT HOLD TESTS PASSED SUCCESSFULLY!\n');
  } catch (err: any) {
    console.error('❌ Test runner failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runSlotHoldTests();
