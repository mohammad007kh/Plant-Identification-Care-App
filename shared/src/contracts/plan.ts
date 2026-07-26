import { z } from 'zod';
import { tierKeySchema } from './credit';

/** Mirrors OpenAPI `Plan`. priceMinor is integer minor units (never a float). */
export const planSchema = z.object({
  id: z.string().uuid(),
  key: tierKeySchema,
  monthlyCreditAllowance: z.number().int().nonnegative(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
});
export type Plan = z.infer<typeof planSchema>;
