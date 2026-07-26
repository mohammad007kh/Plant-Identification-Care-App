import { z } from 'zod';

export const chatRoleSchema = z.enum(['user', 'assistant']);

/** Send a chat message about a plant. Up to 2 of the plant's photos as context. */
export const chatMessageRequestSchema = z.object({
  content: z.string().min(1).max(4000),
  contextPhotoIds: z.array(z.string().uuid()).max(2).optional(),
});
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  role: chatRoleSchema,
  content: z.string(),
  contextPhotoIds: z.array(z.string().uuid()).max(2),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
