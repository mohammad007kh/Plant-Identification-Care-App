import { z } from 'zod';

/** Mirrors the `health_verdict` Postgres enum (backend `db/schema/support.ts`). */
export const healthVerdictSchema = z.enum(['improved', 'worse', 'unchanged']);
export type HealthVerdict = z.infer<typeof healthVerdictSchema>;

/**
 * A completed comparison scan's persisted verdict (US5, FR-011). Surfaced via
 * `GET /v1/scans/{id}` for `type: comparison` scans once T-107 wires the route;
 * this contract is the stable shape that wiring will validate against.
 */
export const comparisonResultSchema = z.object({
  verdict: healthVerdictSchema,
  /** The two most recent photo `public_id`s the verdict was computed from. */
  referencedPhotoIds: z.array(z.string().uuid()),
});
export type ComparisonResult = z.infer<typeof comparisonResultSchema>;
