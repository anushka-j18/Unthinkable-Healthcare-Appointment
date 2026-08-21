import { Request, Response } from 'express';
import { AppointmentStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generatePostVisitSummary } from '../services/llm.service';
import { PostVisitNoteInput } from '../validators/postvisit.validator';

/**
 * GET /api/doctor/appointments
 * Retrieves all appointments assigned to the authenticated Doctor.
 */
export async function getDoctorAppointmentsController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    // Resolve doctor profile for authenticated user
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!doctorProfile) {
      res.status(404).json({ error: 'Not Found', message: 'Doctor profile associated with account not found' });
      return;
    }

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: doctorProfile.id },
      include: {
        patient: {
          select: { id: true, name: true, email: true, phone: true },
        },
        symptomForm: true,
        postVisitNote: true,
      },
      orderBy: { slotStartTime: 'desc' },
    });

    res.status(200).json({
      count: appointments.length,
      appointments,
    });
  } catch (error: any) {
    console.error('GetDoctorAppointments Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * POST /api/doctor/appointments/:appointmentId/post-visit
 * Submits clinical consultation notes and prescription for an appointment.
 * Generates AI patient-friendly summary & updates appointment status to COMPLETED.
 */
export async function submitPostVisitNoteController(req: Request, res: Response): Promise<void> {
  try {
    const { appointmentId } = req.params;
    const input: PostVisitNoteInput = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Not Found', message: 'Appointment not found' });
      return;
    }

    // If caller is DOCTOR, verify they own the appointment (unless ADMIN)
    if (req.user?.role === Role.DOCTOR) {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id },
      });
      if (!doctorProfile || appointment.doctorId !== doctorProfile.id) {
        res.status(403).json({ error: 'Forbidden', message: 'You are not authorized to record notes for this appointment' });
        return;
      }
    }

    // 1. Process AI Patient-Friendly Summary & Medication Schedule Extraction
    let summaryResult = null;
    try {
      summaryResult = await generatePostVisitSummary(input.doctorNotes);
    } catch (err) {
      console.error('LLM Post-visit summarizer error handled gracefully:', err);
      summaryResult = null;
    }

    // Merge doctor-provided prescription items with LLM-extracted medications
    const doctorPrescription = input.prescription || [];
    const llmMedications = summaryResult?.medications || [];
    const mergedPrescriptionMap = new Map<string, any>();

    doctorPrescription.forEach((item) => {
      mergedPrescriptionMap.set(item.name.toLowerCase(), item);
    });

    llmMedications.forEach((item) => {
      if (!mergedPrescriptionMap.has(item.name.toLowerCase())) {
        mergedPrescriptionMap.set(item.name.toLowerCase(), item);
      }
    });

    const finalPrescriptionList = Array.from(mergedPrescriptionMap.values());

    // 2. Upsert PostVisitNote record
    const postVisitNote = await prisma.postVisitNote.upsert({
      where: { appointmentId: appointment.id },
      update: {
        doctorNotes: input.doctorNotes,
        prescription: (finalPrescriptionList as any) || null,
        patientSummary: summaryResult?.patientSummary || null,
      },
      create: {
        appointmentId: appointment.id,
        doctorNotes: input.doctorNotes,
        prescription: (finalPrescriptionList as any) || null,
        patientSummary: summaryResult?.patientSummary || null,
      },
    });

    // 3. Auto-populate MedicationReminder schedules for background worker
    if (finalPrescriptionList.length > 0) {
      await prisma.medicationReminder.deleteMany({
        where: { appointmentId: appointment.id },
      });

      for (const item of finalPrescriptionList) {
        await prisma.medicationReminder.create({
          data: {
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            medicationName: item.name,
            dosage: item.dosage,
            frequency: item.frequency,
            reminderTime: new Date(Date.now() + 60 * 1000), // Default 1 minute initial schedule
            status: 'PENDING',
          },
        });
      }
    }

    // 4. Update Appointment status to COMPLETED
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.COMPLETED,
      },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
        doctor: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        symptomForm: true,
        postVisitNote: true,
        medicationReminders: true,
      },
    });

    res.status(201).json({
      message: 'Post-visit consultation notes and prescription recorded successfully',
      postVisitNote,
      appointment: updatedAppointment,
    });
  } catch (error: any) {
    console.error('SubmitPostVisitNote Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
