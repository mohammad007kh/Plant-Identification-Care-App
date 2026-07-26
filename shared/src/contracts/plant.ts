import { z } from 'zod';

/** Mirrors OpenAPI `Plant`. */
export const plantSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().nullable(),
  species: z.unknown().nullable(),
  photos: z.array(z.unknown()),
});
export type Plant = z.infer<typeof plantSchema>;

export const savePlantRequestSchema = z.object({
  scanPublicId: z.string().uuid(),
  nickname: z.string().max(120).optional(),
});
export type SavePlantRequest = z.infer<typeof savePlantRequestSchema>;

export const updatePlantRequestSchema = z.object({
  nickname: z.string().max(120).nullable().optional(),
});
export type UpdatePlantRequest = z.infer<typeof updatePlantRequestSchema>;
