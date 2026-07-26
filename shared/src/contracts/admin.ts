import { z } from 'zod';
import { tierKeySchema } from './credit';

/**
 * `app_config` value shapes read live by the backend AppConfigService (FR-005/FR-027).
 * These are the operator-configurable settings that must change without a deploy.
 */

// A MIME type like `image/jpeg`. SVG is deliberately allowed as a *string* here;
// the upload validator (T-014) excludes it explicitly for safety.
const mimeTypeSchema = z.string().regex(/^[-\w.]+\/[-\w.+]+$/, 'not a valid MIME type');

/** app_config key `allowed_photo_file_types` → array of allowed MIME types. */
export const allowedPhotoFileTypesConfigSchema = z.array(mimeTypeSchema).min(1);
export type AllowedPhotoFileTypesConfig = z.infer<typeof allowedPhotoFileTypesConfigSchema>;

/** A single allowed image MIME type. */
export type AllowedImageType = z.infer<typeof mimeTypeSchema>;

/** app_config key `credit_costs` → per-action integer credit cost. */
export const creditCostsConfigSchema = z.object({
  identify: z.number().int().nonnegative(),
  chat: z.number().int().nonnegative(),
  comparison: z.number().int().nonnegative(),
});
export type CreditCostsConfig = z.infer<typeof creditCostsConfigSchema>;

/**
 * Admin catalog + operational-config contracts (T-140, US9, FR-005/FR-014/
 * FR-021/FR-024/FR-027). These back `GET/POST/PATCH /v1/admin/species`,
 * `GET/PATCH /v1/admin/config`, and `GET/PATCH /v1/admin/tiers` — all
 * `role=admin`-only. Config values round-trip through the SAME schemas the
 * read side (AppConfigService) parses with, so an admin write is guaranteed
 * to be readable by every consumer with no deploy.
 */

// --- Admin catalog (species) — FR-024 ---

/** Free-form per-species care instructions (watering/light/soil/etc.). */
export const careGuideSchema = z.record(z.string(), z.unknown());
export type CareGuide = z.infer<typeof careGuideSchema>;

/** Mirrors OpenAPI `AdminSpecies`. */
export const adminSpeciesSchema = z.object({
  publicId: z.string().uuid(),
  scientificName: z.string().min(1),
  commonNameFa: z.string().nullable(),
  careGuide: careGuideSchema.nullable(),
});
export type AdminSpecies = z.infer<typeof adminSpeciesSchema>;

export const createSpeciesRequestSchema = z.object({
  scientificName: z.string().min(1).max(200),
  commonNameFa: z.string().max(200).nullable().optional(),
  careGuide: careGuideSchema.nullable().optional(),
});
export type CreateSpeciesRequest = z.infer<typeof createSpeciesRequestSchema>;

export const updateSpeciesRequestSchema = z.object({
  scientificName: z.string().min(1).max(200).optional(),
  commonNameFa: z.string().max(200).nullable().optional(),
  careGuide: careGuideSchema.nullable().optional(),
});
export type UpdateSpeciesRequest = z.infer<typeof updateSpeciesRequestSchema>;

// --- Admin notification config — FR-021 (templates + timing) ---

export const notificationTemplateSchema = z.object({
  subject: z.string().min(1),
  bodyFa: z.string().min(1),
});
export type NotificationTemplate = z.infer<typeof notificationTemplateSchema>;

/** app_config key `notification_config` → per-type templates + local send hour. */
export const notificationConfigSchema = z.object({
  templates: z.object({
    watering: notificationTemplateSchema,
    custom: notificationTemplateSchema,
  }),
  sendHourLocalTehran: z.number().int().min(0).max(23),
});
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;

// --- Admin config view — GET/PATCH /v1/admin/config ---

/** Full admin-editable operational config surface (mirrors OpenAPI `AdminConfig`). */
export const adminConfigSchema = z.object({
  allowedPhotoFileTypes: allowedPhotoFileTypesConfigSchema,
  creditCosts: creditCostsConfigSchema,
  notification: notificationConfigSchema,
});
export type AdminConfig = z.infer<typeof adminConfigSchema>;

/** PATCH body: any subset of the config blobs; each provided blob must fully validate. */
export const updateAdminConfigRequestSchema = z.object({
  allowedPhotoFileTypes: allowedPhotoFileTypesConfigSchema.optional(),
  creditCosts: creditCostsConfigSchema.optional(),
  notification: notificationConfigSchema.optional(),
});
export type UpdateAdminConfigRequest = z.infer<typeof updateAdminConfigRequestSchema>;

// --- Admin tier allowances — GET/PATCH /v1/admin/tiers (FR-014/FR-019) ---

export const adminTierSchema = z.object({
  publicId: z.string().uuid(),
  key: tierKeySchema,
  monthlyCreditAllowance: z.number().int().nonnegative(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  active: z.boolean(),
});
export type AdminTier = z.infer<typeof adminTierSchema>;

export const updateTierRequestSchema = z.object({
  key: tierKeySchema,
  monthlyCreditAllowance: z.number().int().nonnegative().optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});
export type UpdateTierRequest = z.infer<typeof updateTierRequestSchema>;
