import { Request, Response } from 'express';
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
