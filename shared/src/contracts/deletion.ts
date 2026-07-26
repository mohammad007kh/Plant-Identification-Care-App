import { z } from 'zod';

/** Mirrors the `deletion_status` DB enum (users table, T-010/T-130). */
export const deletionStatusSchema = z.enum(['active', 'pending_deletion', 'purged']);
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;

/**
 * Response body for `POST/DELETE/GET /v1/account/deletion` (US8, FR-023).
 * `deletionRequestedAt`/`purgeScheduledFor` are null once the account is back
 * to `active` (never requested, or a pending request was cancelled).
 */
export const deletionStatusResponseSchema = z.object({
  deletionStatus: deletionStatusSchema,
  deletionRequestedAt: z.string().datetime().nullable(),
  purgeScheduledFor: z.string().datetime().nullable(),
});
export type DeletionStatusResponse = z.infer<typeof deletionStatusResponseSchema>;
