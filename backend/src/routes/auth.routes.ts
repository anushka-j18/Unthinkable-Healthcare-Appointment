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

import { getGoogleAuthUrl, handleGoogleCallback } from '../services/google.service';

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private (Authenticated users)
 */
router.get('/me', authenticate, getMe);

/**
 * @route   GET /api/auth/google
 * @desc    Initiate Google OAuth 2.0 authorization consent flow for Calendar
 * @access  Private
 */
router.get('/google', authenticate, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const authUrl = getGoogleAuthUrl(req.user.id);
  res.status(200).json({ authUrl });
});

/**
 * @route   GET /api/auth/google/callback
 * @desc    Handle Google OAuth 2.0 callback and exchange code for tokens
 * @access  Public
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.status(400).json({ error: 'Bad Request', message: 'code and state parameters required' });
    return;
  }
  try {
    await handleGoogleCallback(code, state);
    res.status(200).json({ message: 'Google Calendar successfully connected!' });
  } catch (error: any) {
    res.status(500).json({ error: 'OAuth Callback Failed', message: error.message });
  }
});

export default router;
