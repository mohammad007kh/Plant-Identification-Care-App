import { z } from 'zod';

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
