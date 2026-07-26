import { z } from 'zod';

/**
 * Query validation for `GET /v1/admin/users` (registry `api.pagination: cursor`,
 * FR-026). `cursor` is an opaque, server-generated token (see
 * users-admin.repository) — never parsed/constructed by the client. `limit`
 * defaults to 20 and is capped at 100 (mirrors plants/dto/list-plants-query).
 * `q` is an optional free-text search: matched against `email` (substring,
 * case-insensitive) and, when it looks like a UUID, an exact `public_id` match.
 */
export const listAdminUsersQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;
