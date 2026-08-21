import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { Role, AppointmentStatus } from '@prisma/client';

const PORT = 5003;
const BASE_URL = `http://localhost:${PORT}/api`;

interface TestResponse {
  status: number;
  body: any;
}

async function request(
  path: string,
  method: 'GET' | 'POST' | 'PUT',
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

async function runAdminTests() {
  console.log('🚀 Starting Admin Doctor Management & Leave Day Tests...\n');

  const server = app.listen(PORT);

  try {
    // 1. Setup Admin Account
    const adminEmail = 'admin.test@healthcare.com';
    const doctorEmail = 'dr.dermatology@healthcare.com';
    const patientEmail = 'patient.booking@healthcare.com';

    // Cleanup existing test data
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, doctorEmail, patientEmail] } },
    });

    const adminReg = await request('/auth/register', 'POST', {
      email: adminEmail,
      password: 'AdminPassword123!',
      name: 'System Admin',
      role: 'ADMIN',
    });
    assert(adminReg.status === 201, 'Admin account created');
    const adminToken = adminReg.body.token;

    // --- TEST 1: Create Doctor Profile ---
    console.log('\n--- Test Suite 1: Admin Create Doctor Profile ---');
    const createDocRes = await request('/admin/doctors', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Sarah Connor',
      phone: '+1555998877',
      specialisation: 'Dermatology',
      slotDurationMinutes: 45,
      bio: 'Board-certified dermatologist specialising in skin health.',
    }, adminToken);

    assert(createDocRes.status === 201, 'Admin can create doctor profile (201 Created)');
    assert(createDocRes.body.doctor.doctorProfile?.specialisation === 'Dermatology', 'DoctorProfile created with correct specialisation');
    assert(createDocRes.body.doctor.doctorProfile?.slotDurationMinutes === 45, 'DoctorProfile created with custom slot duration');
    const doctorProfileId = createDocRes.body.doctor.doctorProfile.id;
    const doctorUserId = createDocRes.body.doctor.id;

    // --- TEST 2: List All Doctors ---
    console.log('\n--- Test Suite 2: Admin List Doctors ---');
    const listDocsRes = await request('/admin/doctors', 'GET', undefined, adminToken);
    assert(listDocsRes.status === 200, 'Admin can list doctors (200 OK)');
    assert(Array.isArray(listDocsRes.body.doctors), 'Returns array of doctors');
    const foundDoc = listDocsRes.body.doctors.find((d: any) => d.email === doctorEmail);
    assert(!!foundDoc, 'Newly created doctor appears in list');

    // --- TEST 3: Edit Doctor Profile ---
    console.log('\n--- Test Suite 3: Admin Edit Doctor Profile ---');
    const editDocRes = await request(`/admin/doctors/${doctorProfileId}`, 'PUT', {
      name: 'Dr. Sarah Connor MD',
      specialisation: 'Cosmetic & Clinical Dermatology',
      slotDurationMinutes: 30,
    }, adminToken);

    assert(editDocRes.status === 200, 'Admin can edit doctor profile (200 OK)');
    assert(editDocRes.body.doctor.specialisation === 'Cosmetic & Clinical Dermatology', 'Specialisation updated');
    assert(editDocRes.body.doctor.user.name === 'Dr. Sarah Connor MD', 'Doctor user name updated');

    // --- TEST 4: Mark Leave Day with Affected Appointments Check ---
    console.log('\n--- Test Suite 4: Mark Leave Day & Affected Bookings Check ---');

    // Create a Patient user
    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'Mark Patient',
      role: 'PATIENT',
    });
    const patientUserId = patientReg.body.user.id;

    // Create a scheduled appointment on 2026-09-10
    const targetLeaveDateStr = '2026-09-10';
    const slotStart = new Date('2026-09-10T10:00:00.000Z');
    const slotEnd = new Date('2026-09-10T10:30:00.000Z');

    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctorProfileId,
        patientId: patientUserId,
        slotStartTime: slotStart,
        slotEndTime: slotEnd,
        status: AppointmentStatus.BOOKED,
      },
    });
    assert(!!appointment.id, 'Test appointment created for target date');

    // Admin marks leave day for target date
    const leaveRes = await request(`/admin/doctors/${doctorProfileId}/leave`, 'POST', {
      date: targetLeaveDateStr,
      reason: 'Attending Dermatology Conference',
    }, adminToken);

    assert(leaveRes.status === 201, 'Leave day marked successfully (201 Created)');
    assert(leaveRes.body.hasAffectedAppointments === true, 'Correctly flags hasAffectedAppointments = true');
    assert(leaveRes.body.affectedAppointmentsCount === 1, 'Correctly identifies 1 affected appointment');
    assert(
      leaveRes.body.affectedAppointments[0].patient.email === patientEmail,
      'Returns affected patient details in response'
    );

    console.log('\n🎉 ALL ADMIN DOCTOR MANAGEMENT TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAdminTests().catch((err) => {
  console.error('Fatal Admin Test Execution Error:', err);
  process.exit(1);
});
