import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { NotificationType, NotificationStatus } from '@prisma/client';

const PORT = 5007;
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

async function runEmailNotificationTests() {
  console.log('🚀 Starting Nodemailer Email Dispatch & NotificationLog Audit Tests...\n');

  const server = app.listen(PORT);

  try {
    const adminEmail = 'admin.email@healthcare.com';
    const doctorEmail = 'dr.email@healthcare.com';
    const patientEmail1 = 'patient.email1@healthcare.com';
    const patientEmail2 = 'patient.email2@healthcare.com';

    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, doctorEmail, patientEmail1, patientEmail2] } },
    });

    // 1. Create Admin
    const adminReg = await request('/auth/register', 'POST', {
      email: adminEmail,
      password: 'AdminPassword123!',
      name: 'System Admin',
      role: 'ADMIN',
    });
    const adminToken = adminReg.body.token;

    // 2. Create Doctor
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Sarah Connor',
      role: 'DOCTOR',
      specialisation: 'Orthopedics',
      slotDurationMinutes: 30,
      workingHours: {
        friday: { start: '09:00', end: '17:00' },
      },
    });
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    // 3. Create Patient 1 & Patient 2
    const patient1Reg = await request('/auth/register', 'POST', {
      email: patientEmail1,
      password: 'PatientPassword123!',
      name: 'Emma Patient',
      role: 'PATIENT',
    });
    const patient1Token = patient1Reg.body.token;

    const patient2Reg = await request('/auth/register', 'POST', {
      email: patientEmail2,
      password: 'PatientPassword123!',
      name: 'Frank Patient',
      role: 'PATIENT',
    });
    const patient2Token = patient2Reg.body.token;

    // --- TEST 1: Booking Confirmation Emails & Notification Logs ---
    console.log('\n--- Test Suite 1: Booking Confirmation Notifications ---');
    const slotTime1 = '2026-09-18T09:00:00.000Z'; // 2026-09-18 is a Friday
    const book1Res = await request(
      '/appointments',
      'POST',
      { doctorId: doctorProfileId, slotStartTime: slotTime1 },
      patient1Token
    );
    assert(book1Res.status === 201, 'Booking 1 created successfully');
    const appt1Id = book1Res.body.appointment.id;

    // Give async notification dispatch milliseconds to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    const bookingLogs = await prisma.notificationLog.findMany({
      where: { appointmentId: appt1Id, type: NotificationType.BOOKING_CONFIRMATION },
    });
    assert(bookingLogs.length === 2, '2 NotificationLog entries created for Booking Confirmation (Patient + Doctor)');
    assert(
      bookingLogs.some((log) => log.recipientEmail === patientEmail1 && log.status === NotificationStatus.SENT),
      'Patient booking confirmation email logged as SENT'
    );
    assert(
      bookingLogs.some((log) => log.recipientEmail === doctorEmail && log.status === NotificationStatus.SENT),
      'Doctor booking confirmation email logged as SENT'
    );

    // --- TEST 2: Appointment Cancellation Email & Notification Logs ---
    console.log('\n--- Test Suite 2: Appointment Cancellation Notifications ---');
    const cancelRes = await request(
      `/appointments/${appt1Id}/cancel`,
      'POST',
      { reason: 'Schedule conflict' },
      patient1Token
    );
    assert(cancelRes.status === 200, 'Appointment cancelled successfully');

    await new Promise((resolve) => setTimeout(resolve, 300));

    const cancelLogs = await prisma.notificationLog.findMany({
      where: { appointmentId: appt1Id, type: NotificationType.APPOINTMENT_CANCELLATION },
    });
    assert(cancelLogs.length === 2, '2 NotificationLog entries created for Cancellation (Patient + Doctor)');
    assert(
      cancelLogs.some((log) => log.recipientEmail === patientEmail1 && log.status === NotificationStatus.SENT),
      'Patient cancellation email logged as SENT'
    );

    // --- TEST 3: Doctor Leave Day Rebooking Notice & Notification Logs ---
    console.log('\n--- Test Suite 3: Leave-Triggered Patient Rebooking Notices ---');
    const slotTime2 = '2026-09-18T10:00:00.000Z';
    const book2Res = await request(
      '/appointments',
      'POST',
      { doctorId: doctorProfileId, slotStartTime: slotTime2 },
      patient2Token
    );
    assert(book2Res.status === 201, 'Booking 2 created successfully');
    const appt2Id = book2Res.body.appointment.id;

    // Admin marks leave on 2026-09-18
    const leaveRes = await request(
      `/admin/doctors/${doctorProfileId}/leave`,
      'POST',
      { date: '2026-09-18', reason: 'Medical Conference Attendance' },
      adminToken
    );
    assert(leaveRes.status === 201, 'Doctor leave day recorded');
    assert(leaveRes.body.hasAffectedAppointments === true, 'Correctly identified affected appointment');

    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatedAppt2 = await prisma.appointment.findUnique({ where: { id: appt2Id } });
    assert(updatedAppt2?.status === 'CANCELLED', 'Affected appointment automatically transitioned to CANCELLED');

    const leaveLogs = await prisma.notificationLog.findMany({
      where: { appointmentId: appt2Id, type: NotificationType.LEAVE_CANCELLATION },
    });
    assert(leaveLogs.length === 1, 'NotificationLog entry created for Leave Cancellation Notice');
    assert(leaveLogs[0].recipientEmail === patientEmail2, 'Leave cancellation sent to affected patient email');
    assert(leaveLogs[0].status === NotificationStatus.SENT, 'Leave cancellation status recorded as SENT');

    console.log('\n🎉 ALL NODEMAILER EMAIL DISPATCH & NOTIFICATION LOG TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runEmailNotificationTests().catch((err) => {
  console.error('Fatal Email Notification Test Error:', err);
  process.exit(1);
});
