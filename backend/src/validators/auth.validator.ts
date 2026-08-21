import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
  phone: z.string().trim().optional(),
  role: z.nativeEnum(Role).optional().default(Role.PATIENT),
  // Optional doctor profile details when role is DOCTOR
  specialisation: z.string().trim().optional(),
  slotDurationMinutes: z.number().int().min(15).max(120).optional(),
  workingHours: z.record(z.string(), z.any()).optional(),
  bio: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
