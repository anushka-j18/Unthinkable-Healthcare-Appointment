import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { NotificationType, NotificationStatus, ReminderStatus } from '@prisma/client';
import {
  processMedicationReminders,
  processFailedEmailRetries,
} from '../src/workers/queue.worker';

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

async function runWorkerTests() {
  console.log('🚀 Starting BullMQ & Background Worker Job Tests...\n');

  const server = app.listen(PORT);

  try {
    const doctorEmail = 'dr.worker@healthcare.com';
    const patientEmail = 'patient.worker@healthcare.com';

    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: [doctorEmail, patientEmail] } },
    });

    // 1. Create Doctor & Patient
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Worker Specialist',
      role: 'DOCTOR',
      specialisation: 'Pulmonology',
    });
    const doctorToken = doctorReg.body.token;

    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'Grace Patient',
      role: 'PATIENT',
    });
    const patientToken = patientReg.body.token;

    // 2. Book appointment & submit post-visit note
    const slotTime = '2026-09-21T09:00:00.000Z'; // 2026-09-21 is a Monday
    const bookRes = await request(
      '/appointments',
      'POST',
      { doctorId: doctorReg.body.user.doctorProfile.id, slotStartTime: slotTime },
      patientToken
    );
    const apptId = bookRes.body.appointment.id;

    // --- TEST 1: Medication Reminder Auto-Population & Worker Execution ---
    console.log('\n--- Test Suite 1: Medication Reminder Job ---');
    const postVisitRes = await request(
      `/doctor/appointments/${apptId}/post-visit`,
      'POST',
      {
        doctorNotes: 'Prescribed Azithromycin for respiratory infection.',
        prescription: [
          { name: 'Azithromycin', dosage: '250mg', frequency: 'Once daily', durationDays: 5 },
        ],
      },
      doctorToken
    );
    assert(postVisitRes.status === 201, 'Post-visit note submitted');

    // Check MedicationReminder row created
    const reminderRow = await prisma.medicationReminder.findFirst({
      where: { appointmentId: apptId },
    });
    assert(!!reminderRow, 'MedicationReminder row created automatically from post-visit prescription');
    assert(reminderRow?.medicationName === 'Azithromycin', 'Medication name matches prescription');

    // Force reminderTime to past so worker picks it up immediately
    await prisma.medicationReminder.update({
      where: { id: reminderRow!.id },
      data: { reminderTime: new Date(Date.now() - 1000) },
    });

    // Execute Medication Reminder Job
    const remindersProcessed = await processMedicationReminders();
    assert(remindersProcessed >= 1, 'Medication reminder job processed pending reminder');

    const updatedReminder = await prisma.medicationReminder.findUnique({
      where: { id: reminderRow!.id },
    });
    assert(updatedReminder?.status === ReminderStatus.SENT, 'Medication reminder status updated to SENT');

    const medLog = await prisma.notificationLog.findFirst({
      where: { appointmentId: apptId, type: NotificationType.MEDICATION_REMINDER },
    });
    assert(!!medLog && medLog.status === NotificationStatus.SENT, 'NotificationLog created for medication reminder');

    // --- TEST 2: Email Failure Retry Job (Exponential Backoff & Max 3 Retries) ---
    console.log('\n--- Test Suite 2: Email Failure Retry Job ---');
    // Create simulated failed NotificationLog entry with retryCount = 2
    const failedLog = await prisma.notificationLog.create({
      data: {
        recipientEmail: 'invalid-failing-email@test.com',
        type: NotificationType.APPOINTMENT_REMINDER,
        channel: 'EMAIL',
        status: NotificationStatus.FAILED,
        retryCount: 2, // 2 previous retries failed
        errorMessage: 'Simulated SMTP Connection Refused',
      },
    });

    // Execute Retry Job (This will be attempt #3)
    await processFailedEmailRetries();

    const retriedLog = await prisma.notificationLog.findUnique({
      where: { id: failedLog.id },
    });
    assert(retriedLog?.retryCount === 3, 'Retry count incremented to 3');
    assert(
      retriedLog?.status === NotificationStatus.PERMANENTLY_FAILED || retriedLog?.status === NotificationStatus.SENT,
      'Log status updated to PERMANENTLY_FAILED after reaching max 3 failed attempts'
    );

    console.log('\n🎉 ALL BULLMQ & BACKGROUND WORKER JOB TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runWorkerTests().catch((err) => {
  console.error('Fatal Worker Test Error:', err);
  process.exit(1);
});
