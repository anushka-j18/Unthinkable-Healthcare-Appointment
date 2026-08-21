import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/protected/patient-only
 * @desc    Test endpoint accessible only to PATIENT role
 * @access  Private (PATIENT)
 */
router.get('/patient-only', authenticate, requireRole(Role.PATIENT), (req: Request, res: Response) => {
  res.json({
    message: 'Welcome Patient! Access granted to patient dashboard resource.',
    user: req.user,
  });
});

/**
 * @route   GET /api/protected/doctor-only
 * @desc    Test endpoint accessible only to DOCTOR role
 * @access  Private (DOCTOR)
 */
router.get('/doctor-only', authenticate, requireRole(Role.DOCTOR), (req: Request, res: Response) => {
  res.json({
    message: 'Welcome Doctor! Access granted to clinical schedule resource.',
    user: req.user,
  });
});

/**
 * @route   GET /api/protected/admin-only
 * @desc    Test endpoint accessible only to ADMIN role
 * @access  Private (ADMIN)
 */
router.get('/admin-only', authenticate, requireRole(Role.ADMIN), (req: Request, res: Response) => {
  res.json({
    message: 'Welcome Admin! Access granted to system management resource.',
    user: req.user,
  });
});

/**
 * @route   GET /api/protected/clinical-access
 * @desc    Test endpoint accessible to DOCTOR or ADMIN roles
 * @access  Private (DOCTOR, ADMIN)
 */
router.get('/clinical-access', authenticate, requireRole(Role.DOCTOR, Role.ADMIN), (req: Request, res: Response) => {
  res.json({
    message: 'Access granted to clinical records (DOCTOR or ADMIN only).',
    user: req.user,
  });
});

export default router;
