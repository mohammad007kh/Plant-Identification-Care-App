import { z } from 'zod';

/** RFC 7807 problem+json body (mirrors OpenAPI `Problem`). */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
});
export type Problem = z.infer<typeof problemSchema>;

/** Cursor-paginated envelope (mirrors OpenAPI `CursorPage`). */
export function cursorPageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
