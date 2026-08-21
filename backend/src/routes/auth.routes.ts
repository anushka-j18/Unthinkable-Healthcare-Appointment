import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (PATIENT, DOCTOR, or ADMIN)
 * @access  Public
 */
router.post('/register', validateBody(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & return JWT token
 * @access  Public
 */
router.post('/login', validateBody(loginSchema), login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private (Authenticated users)
 */
router.get('/me', authenticate, getMe);

export default router;
