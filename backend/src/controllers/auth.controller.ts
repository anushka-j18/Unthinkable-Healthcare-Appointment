import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { RegisterInput, LoginInput } from '../validators/auth.validator';

/**
 * Sanitizes user record by omitting sensitive passwordHash field.
 */
function sanitizeUser(user: any) {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

/**
 * Handles user registration for PATIENT, DOCTOR, and ADMIN roles.
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const input: RegisterInput = req.body;

    // Check if user with given email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Conflict', message: 'User with this email already exists' });
      return;
    }

    // Hash user password
    const passwordHash = await hashPassword(input.password);
    const assignedRole = input.role || Role.PATIENT;

    let user;

    if (assignedRole === Role.DOCTOR) {
      // Create user and associated DoctorProfile
      user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone || null,
          role: Role.DOCTOR,
          doctorProfile: {
            create: {
              specialisation: input.specialisation || 'General Medicine',
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
          doctorProfile: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone || null,
          role: assignedRole,
        },
      });
    }

    // Generate JWT issuance
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * Handles user login for PATIENT, DOCTOR, and ADMIN roles.
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const input: LoginInput = req.body;

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        doctorProfile: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}

/**
 * Fetches profile details of currently authenticated user.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        doctorProfile: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Not Found', message: 'User profile not found' });
      return;
    }

    res.status(200).json({
      user: sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('GetMe Error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
