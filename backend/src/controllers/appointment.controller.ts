import { Request, Response } from 'express';
import { AppointmentStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  searchDoctors,
  calculateAvailableSlots,
  bookAppointment,
  SlotUnavailableError,
} from '../services/booking.service';
import {
  SearchDoctorQuery,
  GetSlotsQuery,
  BookAppointmentInput,
} from '../validators/appointment.validator';
import { sendAppointmentCancellationNotifications } from '../services/email.service';

/**
 * GET /api/doctors?specialisation=X
 * Searches doctors with optional specialisation filter.
 */
export async function getDoctorsController(req: Request, res: Response): Promise<void> {
  try {
    const query: SearchDoctorQuery = req.query as any;
    const doctors = await searchDoctors(query.specialisation);
    res.status(200).json({
      count: doctors.length,
      doctors,
    });
  } catch (error: any) {
    console.error('GetDoctors Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * GET /api/doctors/:doctorId/slots?date=YYYY-MM-DD
 * Computes available time slots for a doctor on a target date.
 */
export async function getDoctorSlotsController(req: Request, res: Response): Promise<void> {
  try {
    const { doctorId } = req.params;
    const query: GetSlotsQuery = req.query as any;

    if (!query.date) {
      res.status(400).json({ error: 'Bad Request', message: 'date query parameter is required (e.g. ?date=YYYY-MM-DD)' });
      return;
    }

    const slotData = await calculateAvailableSlots(doctorId, query.date);
    res.status(200).json(slotData);
  } catch (error: any) {
    console.error('GetDoctorSlots Error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Not Found', message: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * POST /api/appointments
 * Books an appointment slot for an authenticated patient.
 */
export async function bookAppointmentController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required to book appointments' });
      return;
    }

    const input: BookAppointmentInput = req.body;
    const appointment = await bookAppointment(req.user.id, input.doctorId, input.slotStartTime, input.symptoms);

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment,
    });
  } catch (error: any) {
    if (error instanceof SlotUnavailableError) {
      res.status(409).json({
        error: 'Conflict',
        message: error.message,
      });
      return;
    }
    console.error('BookAppointment Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * POST /api/appointments/:id/cancel
 * Cancels an appointment and dispatches cancellation emails & notification audit logs.
 */
export async function cancelAppointmentController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Not Found', message: 'Appointment not found' });
      return;
    }

    // Check authorization: PATIENT owner, assigned DOCTOR, or ADMIN
    const isPatient = appointment.patientId === req.user.id;
    const isAdmin = req.user.role === Role.ADMIN;
    let isDoctor = false;

    if (req.user.role === Role.DOCTOR) {
      const docProfile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
      if (docProfile && docProfile.id === appointment.doctorId) {
        isDoctor = true;
      }
    }

    if (!isPatient && !isDoctor && !isAdmin) {
      res.status(403).json({ error: 'Forbidden', message: 'Not authorized to cancel this appointment' });
      return;
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Send Cancellation Email Notifications & log to NotificationLog
    sendAppointmentCancellationNotifications(updatedAppointment, reason).catch((err) => {
      console.error('Failed to send cancellation email:', err);
    });

    res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment: updatedAppointment,
    });
  } catch (error: any) {
    console.error('CancelAppointment Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
