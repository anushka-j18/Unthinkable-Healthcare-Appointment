import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { bookAppointmentSchema, holdSlotSchema } from '../validators/appointment.validator';
import {
  getDoctorsController,
  getDoctorSlotsController,
  bookAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  getPatientAppointmentsController,
  holdSlotController,
  releaseHoldController,
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
 * @route   GET /api/appointments/my
 * @desc    Get all appointments for the logged-in patient (Upcoming & Past)
 * @access  Private (Authenticated Patient)
 */
appointmentsRouter.get('/my', authenticate, getPatientAppointmentsController);

/**
 * @route   POST /api/appointments/hold
 * @desc    Reserves a doctor slot for 5 minutes for an authenticated patient
 * @access  Private (Authenticated Patient)
 */
appointmentsRouter.post('/hold', authenticate, validateBody(holdSlotSchema), holdSlotController);

/**
 * @route   POST /api/appointments/release-hold
 * @desc    Releases an active slot hold for an authenticated patient
 * @access  Private (Authenticated Patient)
 */
appointmentsRouter.post('/release-hold', authenticate, validateBody(holdSlotSchema), releaseHoldController);

/**
 * @route   POST /api/appointments
 * @desc    Book an appointment slot for an authenticated patient
 * @access  Private (Authenticated Patient)
 */
appointmentsRouter.post('/', authenticate, validateBody(bookAppointmentSchema), bookAppointmentController);

/**
 * @route   POST /api/appointments/:id/cancel
 * @desc    Cancel an appointment and dispatch cancellation emails & notification logs
 * @access  Private (Patient owner, assigned Doctor, or Admin)
 */
appointmentsRouter.post('/:id/cancel', authenticate, cancelAppointmentController);

/**
 * @route   POST /api/appointments/:id/reschedule
 * @desc    Reschedule an appointment to a new slotStartTime and sync Google Calendar
 * @access  Private (Authenticated Patient, assigned Doctor, or Admin)
 */
appointmentsRouter.post('/:id/reschedule', authenticate, rescheduleAppointmentController);
