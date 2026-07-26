import { z } from 'zod';
import { cursorPageSchema } from './common';
import { tierKeySchema } from './credit';
import { misidentificationReportStatusSchema } from './misidentification-report';

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

/**
 * Admin user management + misidentification-report triage contracts (T-141,
 * US9, FR-025/FR-026). Back `GET /v1/admin/users`, `GET /v1/admin/users/{id}`,
 * `PATCH /v1/admin/users/{id}`, and `GET /v1/admin/misidentification-reports` —
 * all `role=admin`-only. Response envelopes reuse the shared `cursorPageSchema`
 * (`data`/`nextCursor`), matching every other cursor-paginated list in this app.
 */

// --- Admin user search/detail/action — FR-026 ---

/** Mirrors `core.ts`'s `deletion_status` enum (T-010) — never re-declared with different values. */
export const adminUserStatusSchema = z.enum(['active', 'pending_deletion', 'purged']);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

/**
 * Deliberately minimal: no `passwordHash`, no internal ULID `id` — only
 * `publicId` + fields an admin needs to triage an account (Station 13 "no
 * secret leakage" rule). `tier` is null for a user with no subscription row yet
 * (defaults to Free elsewhere in the app).
 */
export const adminUserSummarySchema = z.object({
  publicId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  status: adminUserStatusSchema,
  tier: tierKeySchema.nullable(),
  creditBalance: z.number().int(),
  createdAt: z.string().datetime(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserListResponseSchema = cursorPageSchema(adminUserSummarySchema);
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/**
 * PATCH body for an administrative account action (adjust tier and/or credit
 * balance). `reason` is REQUIRED on every call — it is what gets written to the
 * audit record (Station 17 "actions are audited" rule) — and at least one of
 * `tier`/`creditAdjustment` must be present, or the call has no effect.
 * "Suspend" (mentioned in the domain rules) has no backing column in the
 * current `users` schema (only `deletion_status: active|pending_deletion|
 * purged`, which models self-service deletion, not admin suspension) — flagged
 * as a follow-up requiring a schema change, out of this task's scope.
 */
export const adminUserActionRequestSchema = z
  .object({
    reason: z.string().min(1, 'reason is required').max(500),
    tier: tierKeySchema.optional(),
    creditAdjustment: z
      .number()
      .int()
      .refine((v) => v !== 0, 'creditAdjustment must not be 0')
      .optional(),
  })
  .refine((v) => v.tier !== undefined || v.creditAdjustment !== undefined, {
    message: 'at least one of tier or creditAdjustment must be provided',
  });
export type AdminUserActionRequest = z.infer<typeof adminUserActionRequestSchema>;

// --- Admin misidentification-report triage (read-only here) — FR-025 ---

/**
 * Mirrors OpenAPI's admin report shape: the reported scan's snapshot AI result
 * + a signed photo URL for admin review. Read-only in this task (T-141) — the
 * report was created by T-022; nothing here mutates `status`.
 */
export const adminMisidentificationReportSchema = z.object({
  id: z.string().uuid(),
  status: misidentificationReportStatusSchema,
  note: z.string().nullable(),
  /** Snapshot of the reported scan's AI result at report time (arbitrary shape). */
  aiResult: z.unknown(),
  /** Time-limited signed URL, or null when the scan's photo could not be resolved. */
  photoUrl: z.string().nullable(),
  /** Public id of the reported scan, for cross-referencing. */
  scanId: z.string().uuid(),
  /** Reporting user's public id, or null for a guest-submitted report. */
  reporterUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminMisidentificationReport = z.infer<typeof adminMisidentificationReportSchema>;

export const adminMisidentificationReportListResponseSchema = cursorPageSchema(
  adminMisidentificationReportSchema,
);
export type AdminMisidentificationReportListResponse = z.infer<
  typeof adminMisidentificationReportListResponseSchema
>;
