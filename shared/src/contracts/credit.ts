import { z } from 'zod';

export const tierKeySchema = z.enum(['free', 'pro', 'max']);
export type TierKey = z.infer<typeof tierKeySchema>;

/** Mirrors OpenAPI `CreditBalance`. Balance is integer credits (minor units). */
export const creditBalanceSchema = z.object({
  balance: z.number().int(),
  tier: tierKeySchema,
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;
