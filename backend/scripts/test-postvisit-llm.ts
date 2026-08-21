import http from 'http';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

const PORT = 5006;
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

async function runPostVisitLLMTests() {
  console.log('🚀 Starting Doctor Post-Visit Clinical Notes & AI Patient Summarizer Tests...\n');

  const server = app.listen(PORT);

  try {
    const doctorEmail = 'dr.postvisit.llm@healthcare.com';
    const patientEmail = 'patient.postvisit.llm@healthcare.com';

    // Cleanup existing test data
    await prisma.user.deleteMany({
      where: { email: { in: [doctorEmail, patientEmail] } },
    });

    // 1. Create Doctor Profile & obtain token
    const doctorReg = await request('/auth/register', 'POST', {
      email: doctorEmail,
      password: 'DoctorPassword123!',
      name: 'Dr. Gregory House',
      role: 'DOCTOR',
      specialisation: 'Internal Medicine',
      slotDurationMinutes: 30,
      workingHours: {
        thursday: { start: '09:00', end: '17:00' },
      },
    });
    assert(doctorReg.status === 201, 'Doctor profile created');
    const doctorToken = doctorReg.body.token;
    const doctorProfileId = doctorReg.body.user.doctorProfile.id;

    // 2. Create Patient & obtain token
    const patientReg = await request('/auth/register', 'POST', {
      email: patientEmail,
      password: 'PatientPassword123!',
      name: 'David Patient',
      role: 'PATIENT',
    });
    assert(patientReg.status === 201, 'Patient profile created');
    const patientToken = patientReg.body.token;

    // 3. Book an appointment
    const slotTime = '2026-09-17T09:00:00.000Z'; // 2026-09-17 is a Thursday
    const bookRes = await request(
      '/appointments',
      'POST',
      {
        doctorId: doctorProfileId,
        slotStartTime: slotTime,
        symptoms: 'Nasal congestion, facial pressure, and headache for 5 days.',
      },
      patientToken
    );
    assert(bookRes.status === 201, 'Appointment booked successfully');
    const appointmentId = bookRes.body.appointment.id;

    // --- TEST 1: Doctor Submits Post-Visit Notes & Prescription ---
    console.log('\n--- Test Suite 1: Submit Clinical Notes & AI Summarization ---');
    const clinicalNotes = 'Patient diagnosed with acute bacterial sinusitis. Prescribed Amoxicillin 500mg TID for 7 days. Drink warm liquids and follow up if symptoms persist.';

    const postVisitRes = await request(
      `/doctor/appointments/${appointmentId}/post-visit`,
      'POST',
      {
        doctorNotes: clinicalNotes,
        prescription: [
          {
            name: 'Amoxicillin',
            dosage: '500mg',
            frequency: 'Three times daily (TID)',
            durationDays: 7,
          },
        ],
      },
      doctorToken
    );

    assert(postVisitRes.status === 201, 'Post-visit note submission returns 201 Created');
    assert(!!postVisitRes.body.postVisitNote, 'PostVisitNote record created');
    const note = postVisitRes.body.postVisitNote;
    assert(note.doctorNotes === clinicalNotes, 'Clinical notes saved correctly');
    assert(!!note.patientSummary, 'AI patient-friendly summary generated');
    assert(Array.isArray(note.prescription) && note.prescription.length >= 1, 'Structured prescription medications list stored');
    assert(
      note.prescription.some((m: any) => m.name.toLowerCase().includes('amoxicillin')),
      'Prescription includes structured Amoxicillin medication record for future reminder dispatch'
    );

    // --- TEST 2: Verify Appointment Status Updated to COMPLETED ---
    console.log('\n--- Test Suite 2: Appointment Lifecycle Transition ---');
    assert(
      postVisitRes.body.appointment.status === 'COMPLETED',
      'Appointment status successfully updated to COMPLETED'
    );

    console.log('\n🎉 ALL DOCTOR POST-VISIT CLINICAL NOTES & LLM TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPostVisitLLMTests().catch((err) => {
  console.error('Fatal Post-Visit LLM Test Execution Error:', err);
  process.exit(1);
});
