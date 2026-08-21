import { Request, Response } from 'express';
import { Role, AppointmentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../utils/password';
import { CreateDoctorInput, UpdateDoctorInput, MarkLeaveInput } from '../validators/admin.validator';
import { sendLeaveCancellationNotification } from '../services/email.service';

/**
 * Sanitizes user object by removing passwordHash.
 */
function sanitizeUser(user: any) {
  if (!user) return null;
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

/**
 * GET /api/admin/doctors
 * Lists all doctors along with their profile details and scheduled leave days.
 */
export async function listDoctors(_req: Request, res: Response): Promise<void> {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: Role.DOCTOR },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        doctorProfile: {
          include: {
            leaveDays: {
              orderBy: { date: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      count: doctors.length,
      doctors,
    });
  } catch (error: any) {
    console.error('ListDoctors Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * POST /api/admin/doctors
 * Creates a new Doctor user and associated DoctorProfile.
 */
export async function createDoctor(req: Request, res: Response): Promise<void> {
  try {
    const input: CreateDoctorInput = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Conflict', message: 'User with this email already exists' });
      return;
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone || null,
        role: Role.DOCTOR,
        doctorProfile: {
          create: {
            specialisation: input.specialisation,
            slotDurationMinutes: input.slotDurationMinutes || 30,
            workingHours: (input.workingHours as any) || {
              monday: { start: '09:00', end: '17:00' },
              tuesday: { start: '09:00', end: '17:00' },
              wednesday: { start: '09:00', end: '17:00' },
              thursday: { start: '09:00', end: '17:00' },
              friday: { start: '09:00', end: '17:00' },
            },
            bio: input.bio || null,
          },
        },
      },
      include: {
        doctorProfile: {
          include: {
            leaveDays: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Doctor created successfully',
      doctor: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('CreateDoctor Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * PUT /api/admin/doctors/:doctorId
 * Edits an existing Doctor's profile and user details.
 */
export async function updateDoctor(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId } = req.params;
    const input: UpdateDoctorInput = req.body;

    // Resolve DoctorProfile by DoctorProfile.id or User.id
    const existingDoctorProfile = await prisma.doctorProfile.findFirst({
      where: {
        OR: [
          { id: doctorId },
          { userId: doctorId },
        ],
      },
      include: { user: true },
    });

    if (!existingDoctorProfile) {
      res.status(404).json({ error: 'Not Found', message: 'Doctor profile not found' });
      return;
    }

    // Update User fields if name or phone provided
    if (input.name !== undefined || input.phone !== undefined) {
      await prisma.user.update({
        where: { id: existingDoctorProfile.userId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.phone !== undefined && { phone: input.phone }),
        },
      });
    }

    // Update DoctorProfile fields
    const updatedProfile = await prisma.doctorProfile.update({
      where: { id: existingDoctorProfile.id },
      data: {
        ...(input.specialisation !== undefined && { specialisation: input.specialisation }),
        ...(input.slotDurationMinutes !== undefined && { slotDurationMinutes: input.slotDurationMinutes }),
        ...(input.workingHours !== undefined && { workingHours: input.workingHours as any }),
        ...(input.bio !== undefined && { bio: input.bio }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
          },
        },
        leaveDays: true,
      },
    });

    res.status(200).json({
      message: 'Doctor profile updated successfully',
      doctor: updatedProfile,
    });
  } catch (error: any) {
    console.error('UpdateDoctor Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * POST /api/admin/doctors/:doctorId/leave
 * Marks a leave day for a doctor, checks for existing bookings on that date,
 * and returns the list of affected appointments.
 */
export async function markDoctorLeave(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId } = req.params;
    const input: MarkLeaveInput = req.body;

    // Resolve DoctorProfile by DoctorProfile.id or User.id
    const doctorProfile = await prisma.doctorProfile.findFirst({
      where: {
        OR: [
          { id: doctorId },
          { userId: doctorId },
        ],
      },
      include: { user: true },
    });

    if (!doctorProfile) {
      res.status(404).json({ error: 'Not Found', message: 'Doctor profile not found' });
      return;
    }

    // Parse target date to midnight start of day and end of day
    const leaveDate = new Date(input.date);
    const startOfDay = new Date(leaveDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(leaveDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1. Query existing bookings for this doctor on the target date
    const affectedAppointments = await prisma.appointment.findMany({
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
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { slotStartTime: 'asc' },
    });

    // 2. Upsert LeaveDay record for this doctor and date
    const leaveDay = await prisma.leaveDay.upsert({
      where: {
        doctorId_date: {
          doctorId: doctorProfile.id,
          date: startOfDay,
        },
      },
      update: {
        reason: input.reason || null,
      },
      create: {
        doctorId: doctorProfile.id,
        date: startOfDay,
        reason: input.reason || null,
      },
    });

    // 3. Mark affected appointments as CANCELLED and dispatch LEAVE_CANCELLATION emails
    if (affectedAppointments.length > 0) {
      await prisma.appointment.updateMany({
        where: {
          id: { in: affectedAppointments.map((a) => a.id) },
        },
        data: { status: AppointmentStatus.CANCELLED },
      });

      // Dispatch rebooking notification email & audit log for each affected patient
      for (const appt of affectedAppointments) {
        sendLeaveCancellationNotification(appt, doctorProfile.user.name, input.reason).catch((err) => {
          console.error(`Failed to send leave cancellation email for appt ${appt.id}:`, err);
        });
      }
    }

    res.status(201).json({
      message: 'Doctor leave day recorded successfully and affected patients notified',
      leaveDay,
      hasAffectedAppointments: affectedAppointments.length > 0,
      affectedAppointmentsCount: affectedAppointments.length,
      affectedAppointments,
    });
  } catch (error: any) {
    console.error('MarkDoctorLeave Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
