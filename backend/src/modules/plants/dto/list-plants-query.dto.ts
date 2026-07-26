import { z } from 'zod';

/**
 * Query validation for `GET /v1/plants` (registry `api.pagination: cursor`).
 * `cursor` is an opaque, server-generated token (see plants.repository) — never
 * parsed/constructed by the client. `limit` defaults to 20 and is capped at 100.
 */
export const listPlantsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListPlantsQuery = z.infer<typeof listPlantsQuerySchema>;
