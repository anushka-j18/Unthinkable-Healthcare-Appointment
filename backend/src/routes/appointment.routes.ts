import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { bookAppointmentSchema } from '../validators/appointment.validator';
import {
  getDoctorsController,
  getDoctorSlotsController,
  bookAppointmentController,
} from '../controllers/appointment.controller';

export const doctorsRouter = Router();
export const appointmentsRouter = Router();

/**
 * @route   GET /api/doctors?specialisation=X
 * @desc    Search doctors with optional specialisation filter
 * @access  Public
 */
doctorsRouter.get('/', getDoctorsController);

/**
 * @route   GET /api/doctors/:doctorId/slots?date=YYYY-MM-DD
 * @desc    Calculate available slots for a doctor on a target date
 * @access  Public
 */
doctorsRouter.get('/:doctorId/slots', getDoctorSlotsController);

/**
 * @route   POST /api/appointments
 * @desc    Book an appointment slot for an authenticated patient
 * @access  Private (Authenticated Patient)
 */
appointmentsRouter.post('/', authenticate, validateBody(bookAppointmentSchema), bookAppointmentController);
