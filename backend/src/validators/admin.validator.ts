import { z } from 'zod';

export const createDoctorSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
  phone: z.string().trim().optional(),
  specialisation: z.string().trim().min(2, 'Specialisation is required'),
  slotDurationMinutes: z.number().int().min(15).max(120).optional().default(30),
  workingHours: z.record(z.string(), z.any()).optional(),
  bio: z.string().optional(),
});

export const updateDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long').optional(),
  phone: z.string().trim().optional(),
  specialisation: z.string().trim().min(2, 'Specialisation must be at least 2 characters').optional(),
  slotDurationMinutes: z.number().int().min(15).max(120).optional(),
  workingHours: z.record(z.string(), z.any()).optional(),
  bio: z.string().optional(),
});

export const markLeaveSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format. Expected valid date string (e.g. YYYY-MM-DD)',
  }),
  reason: z.string().trim().optional(),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type MarkLeaveInput = z.infer<typeof markLeaveSchema>;
