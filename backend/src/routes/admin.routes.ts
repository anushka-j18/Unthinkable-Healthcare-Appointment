import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createDoctorSchema,
  updateDoctorSchema,
  markLeaveSchema,
} from '../validators/admin.validator';
import {
  listDoctors,
  createDoctor,
  updateDoctor,
  markDoctorLeave,
} from '../controllers/admin.controller';

const router = Router();

// Apply Admin Role protection to all endpoints in this router
router.use(authenticate, requireRole(Role.ADMIN));

/**
 * @route   GET /api/admin/doctors
 * @desc    List all doctors with profiles and leave schedules
 * @access  Private (ADMIN)
 */
router.get('/doctors', listDoctors);

/**
 * @route   POST /api/admin/doctors
 * @desc    Onboard a new Doctor (creates User + DoctorProfile)
 * @access  Private (ADMIN)
 */
router.post('/doctors', validateBody(createDoctorSchema), createDoctor);

/**
 * @route   PUT /api/admin/doctors/:doctorId
 * @desc    Edit a doctor's profile details & working hours
 * @access  Private (ADMIN)
 */
router.put('/doctors/:doctorId', validateBody(updateDoctorSchema), updateDoctor);

/**
 * @route   POST /api/admin/doctors/:doctorId/leave
 * @desc    Mark a doctor's leave day and check for affected appointments
 * @access  Private (ADMIN)
 */
router.post('/doctors/:doctorId/leave', validateBody(markLeaveSchema), markDoctorLeave);

export default router;
