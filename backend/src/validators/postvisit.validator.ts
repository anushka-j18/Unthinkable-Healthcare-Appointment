import { z } from 'zod';

export const medicationSchema = z.object({
  name: z.string().trim().min(1, 'Medication name is required'),
  dosage: z.string().trim().min(1, 'Dosage is required (e.g. 500mg)'),
  frequency: z.string().trim().min(1, 'Frequency is required (e.g. Twice daily)'),
  durationDays: z.number().int().min(1).optional().default(7),
});

export const postVisitNoteSchema = z.object({
  doctorNotes: z.string().trim().min(5, 'Doctor clinical notes must be at least 5 characters long'),
  prescription: z.array(medicationSchema).optional(),
});

export type MedicationItem = z.infer<typeof medicationSchema>;
export type PostVisitNoteInput = z.infer<typeof postVisitNoteSchema>;
