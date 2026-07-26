import { z } from 'zod';

export const scanTypeSchema = z.enum(['identify', 'comparison']);
export const scanStatusSchema = z.enum(['pending', 'completed', 'failed']);

/** Mirrors OpenAPI `ScanJob`. A species is only present when confidence ≥ 0.70. */
export const scanJobSchema = z.object({
  id: z.string().uuid(),
  type: scanTypeSchema,
  status: scanStatusSchema,
  confidence: z.number().min(0).max(1).nullable(),
  species: z.unknown().nullable(),
  careGuide: z.unknown().nullable(),
  lowConfidence: z.boolean(),
});
export type ScanJob = z.infer<typeof scanJobSchema>;

/** Non-file fields of the multipart scan submission (the photo itself is binary). */
export const submitScanRequestSchema = z.object({
  plantId: z.string().uuid().optional(),
});
export type SubmitScanRequest = z.infer<typeof submitScanRequestSchema>;
