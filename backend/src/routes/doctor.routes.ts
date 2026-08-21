import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { postVisitNoteSchema } from '../validators/postvisit.validator';
import {
  getDoctorAppointmentsController,
  submitPostVisitNoteController,
} from '../controllers/doctor.controller';

const router = Router();

// Apply Doctor or Admin role protection to all routes in this router
router.use(authenticate, requireRole(Role.DOCTOR, Role.ADMIN));

/**
 * @route   GET /api/doctor/appointments
 * @desc    Get all appointments assigned to the logged in Doctor
 * @access  Private (DOCTOR, ADMIN)
 */
router.get('/appointments', getDoctorAppointmentsController);

/**
 * @route   POST /api/doctor/appointments/:appointmentId/post-visit
 * @desc    Submit clinical notes and prescription, generate AI patient summary, and complete appointment
 * @access  Private (DOCTOR, ADMIN)
 */
router.post('/appointments/:appointmentId/post-visit', validateBody(postVisitNoteSchema), submitPostVisitNoteController);

export default router;
