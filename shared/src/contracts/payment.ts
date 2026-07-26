import { z } from 'zod';

/** `POST /v1/payments/checkout` request body — the chosen plan's public id. */
export const checkoutRequestSchema = z.object({
  planId: z.string().uuid(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** `POST /v1/payments/checkout` response — the mock Zarinpal redirect URL. */
export const checkoutResponseSchema = z.object({
  redirectUrl: z.string().url(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/** `GET /v1/payments/verify` response — the server-verified outcome. */
export const paymentVerifyResponseSchema = z.object({
  status: z.enum(['verified', 'failed']),
});
export type PaymentVerifyResponse = z.infer<typeof paymentVerifyResponseSchema>;
