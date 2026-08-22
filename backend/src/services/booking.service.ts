/**
 * =====================================================================================
 * CONCURRENCY SAFETY MECHANISM IN APPOINTMENT BOOKING SERVICE
 * =====================================================================================
 * 
 * To strictly prevent race conditions and double-booking (e.g. two patients clicking "Book"
 * simultaneously on the exact same doctor slot at the exact same millisecond):
 * 
 * 1. Database-Level Unique Constraint (Source of Truth):
 *    The Prisma database schema enforces a strict composite unique constraint on:
 *    `@@unique([doctorId, slotStartTime])` on the `Appointment` table.
 *    At the PostgreSQL storage engine level, index entries are serialized atomically.
 *    Only ONE transaction can successfully insert a row with a given (doctorId, slotStartTime).
 * 
 * 2. Atomic Database Transactions & Graceful Error Handling:
 *    All booking requests execute inside `prisma.$transaction`. If two concurrent requests
 *    bypass the preliminary availability check simultaneously:
 *    - Request A inserts the row successfully and commits.
 *    - Request B's insert is rejected at PostgreSQL level with code `P2002` (Unique Constraint Violation).
 * 
 * 3. User-Friendly Conflict Response:
 *    We intercept code `P2002` (or pre-check conflict) and throw a custom `SlotUnavailableError`.
 *    The HTTP controller catches this error and returns a clean 409 Conflict status with:
 *    `{ error: "Conflict", message: "This appointment slot is no longer available. It was just booked by another patient." }`
 * =====================================================================================
 */

import { Role, AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendBookingConfirmationNotifications } from './email.service';
import { syncCreateCalendarEvent } from './google.service';
import { isSlotHeldByOther, releaseHold } from './hold.service';

export class SlotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

/**
 * Searches doctors with optional case-insensitive specialisation filter.
 */
export async function searchDoctors(specialisation?: string) {
  const whereClause: Prisma.UserWhereInput = {
    role: Role.DOCTOR,
  };

  if (specialisation && specialisation.trim() !== '') {
    whereClause.doctorProfile = {
      specialisation: {
        contains: specialisation.trim(),
        mode: 'insensitive',
      },
    };
  }

  const doctors = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
      doctorProfile: {
        select: {
          id: true,
          specialisation: true,
          slotDurationMinutes: true,
          workingHours: true,
          bio: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return doctors;
}

/**
 * Computes available time slots for a given doctor on a specific date.
 * Takes into account working hours, slot duration, leave days, and existing bookings.
 */
export async function calculateAvailableSlots(doctorIdInput: string, dateStr: string) {
  // Resolve DoctorProfile by DoctorProfile.id or User.id
  const doctorProfile = await prisma.doctorProfile.findFirst({
    where: {
      OR: [
        { id: doctorIdInput },
        { userId: doctorIdInput },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!doctorProfile) {
    throw new Error('Doctor profile not found');
  }

  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // 1. Check if doctor is on leave on this date
  const leaveDay = await prisma.leaveDay.findFirst({
    where: {
      doctorId: doctorProfile.id,
      date: startOfDay,
    },
  });

  if (leaveDay) {
    return {
      doctor: doctorProfile,
      date: dateStr,
      isLeaveDay: true,
      isWorkingDay: false,
      leaveReason: leaveDay.reason,
      slots: [],
    };
  }

  // 2. Parse Day of Week & Working Hours
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = daysOfWeek[targetDate.getUTCDay()];

  const workingHoursConfig = doctorProfile.workingHours as Record<string, { start: string; end: string } | undefined>;
  const dayConfig = workingHoursConfig ? workingHoursConfig[dayName] : undefined;

  if (!dayConfig || !dayConfig.start || !dayConfig.end) {
    return {
      doctor: doctorProfile,
      date: dateStr,
      isLeaveDay: false,
      isWorkingDay: false,
      slots: [],
    };
  }

  // Parse start and end time strings (e.g. "09:00" and "17:00")
  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);

  const windowStart = new Date(targetDate);
  windowStart.setUTCHours(startHour, startMin, 0, 0);

  const windowEnd = new Date(targetDate);
  windowEnd.setUTCHours(endHour, endMin, 0, 0);

  // 3. Query existing non-cancelled appointments for this doctor on this date
  const existingBookings = await prisma.appointment.findMany({
    where: {
      doctorId: doctorProfile.id,
      slotStartTime: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: {
        not: AppointmentStatus.CANCELLED,
      },
    },
    select: {
      slotStartTime: true,
      slotEndTime: true,
    },
  });

  const bookedTimestamps = new Set(
    existingBookings.map((b) => b.slotStartTime.getTime())
  );

  // 4. Divide working window into discrete slots
  const durationMs = doctorProfile.slotDurationMinutes * 60 * 1000;
  const slots: Array<{ slotStartTime: string; slotEndTime: string; isAvailable: boolean }> = [];

  let currentSlotStart = new Date(windowStart);

  while (currentSlotStart.getTime() + durationMs <= windowEnd.getTime()) {
    const currentSlotEnd = new Date(currentSlotStart.getTime() + durationMs);
    const isBooked = bookedTimestamps.has(currentSlotStart.getTime());
    const isHeld = await isSlotHeldByOther(doctorProfile.id, currentSlotStart.toISOString());

    slots.push({
      slotStartTime: currentSlotStart.toISOString(),
      slotEndTime: currentSlotEnd.toISOString(),
      isAvailable: !isBooked && !isHeld,
    });

    currentSlotStart = new Date(currentSlotStart.getTime() + durationMs);
  }

  return {
    doctor: doctorProfile,
    date: dateStr,
    isLeaveDay: false,
    isWorkingDay: true,
    slots,
  };
}

import { analyzeSymptoms } from './llm.service';

/**
 * Books an appointment for a patient in a concurrency-safe atomic database transaction.
 * Process optional pre-visit symptom intake via LLM service and stores in SymptomForm.
 */
export async function bookAppointment(
  patientId: string,
  doctorIdInput: string,
  slotStartTimeStr: string,
  symptoms?: string
) {
  // Resolve DoctorProfile by DoctorProfile.id or User.id
  const doctorProfile = await prisma.doctorProfile.findFirst({
    where: {
      OR: [
        { id: doctorIdInput },
        { userId: doctorIdInput },
      ],
    },
  });

  if (!doctorProfile) {
    throw new Error('Doctor profile not found');
  }

  const slotStartTime = new Date(slotStartTimeStr);
  const durationMs = doctorProfile.slotDurationMinutes * 60 * 1000;
  const slotEndTime = new Date(slotStartTime.getTime() + durationMs);

  // Check if doctor is on leave on target date
  const startOfDay = new Date(slotStartTime);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const leaveDay = await prisma.leaveDay.findFirst({
    where: {
      doctorId: doctorProfile.id,
      date: startOfDay,
    },
  });

  if (leaveDay) {
    throw new SlotUnavailableError('Doctor is on scheduled leave on this date.');
  }

  // Check if slot is held by another patient
  const heldByOther = await isSlotHeldByOther(doctorProfile.id, slotStartTimeStr, patientId);
  if (heldByOther) {
    throw new SlotUnavailableError('This slot is currently reserved by another patient. Please choose a different slot.');
  }

  try {
    // Atomic Database Transaction
    const appointment = await prisma.$transaction(async (tx) => {
      // 1. Double check existing booking inside transaction
      const existing = await tx.appointment.findFirst({
        where: {
          doctorId: doctorProfile.id,
          slotStartTime: slotStartTime,
          status: { not: AppointmentStatus.CANCELLED },
        },
      });

      if (existing) {
        throw new SlotUnavailableError('This appointment slot is no longer available. It has already been booked.');
      }

      // 2. Insert new appointment
      return await tx.appointment.create({
        data: {
          doctorId: doctorProfile.id,
          patientId: patientId,
          slotStartTime: slotStartTime,
          slotEndTime: slotEndTime,
          status: AppointmentStatus.BOOKED,
        },
        include: {
          doctor: {
            include: {
              user: {
                select: { id: true, name: true, email: true, phone: true },
              },
            },
          },
          patient: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });
    });

    // Release any active slot hold for this patient upon successful booking
    await releaseHold(patientId, doctorProfile.id, slotStartTimeStr);

    // Send Booking Confirmation Email Notifications (Patient + Doctor) & log to NotificationLog
    sendBookingConfirmationNotifications(appointment).catch((err) => {
      console.error('Failed to send booking confirmation email:', err);
    });

    // Best-Effort Google Calendar Event Sync
    syncCreateCalendarEvent(appointment.id).catch((err) => {
      console.error('Failed to sync Google Calendar event:', err);
    });

    // 3. Process Symptoms Intake if provided by patient
    if (symptoms && symptoms.trim() !== '') {
      let analysisResult = null;
      try {
        analysisResult = await analyzeSymptoms(symptoms.trim());
      } catch (err) {
        console.error('LLM analysis error handled gracefully:', err);
        analysisResult = null;
      }

      const symptomForm = await prisma.symptomForm.create({
        data: {
          appointmentId: appointment.id,
          rawSymptoms: symptoms.trim(),
          urgencyLevel: analysisResult?.urgencyLevel || null,
          chiefComplaint: analysisResult?.chiefComplaint || null,
          suggestedQuestions: (analysisResult?.suggestedQuestions as any) || null,
          llmProcessedAt: analysisResult ? new Date() : null,
        },
      });

      return {
        ...appointment,
        symptomForm,
      };
    }

    return appointment;
  } catch (error: any) {
    // Intercept Prisma Unique Constraint Violation (P2002: doctorId + slotStartTime)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new SlotUnavailableError('This appointment slot is no longer available. It was just booked by another patient.');
    }
    throw error;
  }
}
