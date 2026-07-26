import { z } from 'zod';

/** Rejects raw HTML markup in free-text fields (defense-in-depth; no HTML renderer trusts this field). */
const noHtmlMarkup = (value: string): boolean => !/<[^>]+>/.test(value);

/** Request body for `POST /v1/misidentification-reports` (mirrors OpenAPI). Guest-allowed (no auth required). */
export const createMisidentificationReportRequestSchema = z.object({
  scanId: z.string().uuid(),
  note: z
    .string()
    .max(1000, 'note must be 1000 characters or fewer')
    .refine(noHtmlMarkup, 'note must not contain HTML markup')
    .optional(),
});
export type CreateMisidentificationReportRequest = z.infer<
  typeof createMisidentificationReportRequestSchema
>;

export const misidentificationReportStatusSchema = z.enum(['open', 'reviewed']);

/** `201` response body: just enough for the submitter to reference their report. */
export const misidentificationReportSchema = z.object({
  id: z.string().uuid(),
  status: misidentificationReportStatusSchema,
});
export type MisidentificationReport = z.infer<typeof misidentificationReportSchema>;
