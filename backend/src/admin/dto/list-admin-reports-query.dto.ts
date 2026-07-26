import { z } from 'zod';

/**
 * Query validation for `GET /v1/admin/misidentification-reports` (registry
 * `api.pagination: cursor`, FR-025). `cursor` is an opaque, server-generated
 * token (see reports-admin.repository) — never parsed/constructed by the
 * client. `limit` defaults to 20 and is capped at 100 (mirrors
 * plants/dto/list-plants-query).
 */
export const listAdminReportsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAdminReportsQuery = z.infer<typeof listAdminReportsQuerySchema>;
