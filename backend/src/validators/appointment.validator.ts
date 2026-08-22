import { z } from 'zod';

export const searchDoctorQuerySchema = z.object({
  specialisation: z.string().trim().optional(),
});

export const getSlotsQuerySchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format. Expected valid date string (e.g. YYYY-MM-DD)',
  }),
});

export const bookAppointmentSchema = z.object({
  doctorId: z.string().min(1, 'doctorId is required'),
  slotStartTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid slotStartTime. Expected valid ISO date timestamp',
  }),
  symptoms: z.string().trim().optional(),
});

export const holdSlotSchema = z.object({
  doctorId: z.string().min(1, 'doctorId is required'),
  slotStartTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid slotStartTime. Expected valid ISO date timestamp',
  }),
});

export type SearchDoctorQuery = z.infer<typeof searchDoctorQuerySchema>;
export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type HoldSlotInput = z.infer<typeof holdSlotSchema>;
