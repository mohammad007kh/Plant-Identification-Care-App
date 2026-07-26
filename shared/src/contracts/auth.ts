import { z } from 'zod';

// Password policy = "strong": min 8 chars, at least one letter and one digit.
// Max length caps the hasher's input (argon2 cost scales with input) — an
// unbounded password field is a CPU/memory-exhaustion DoS vector.
const passwordSchema = z
  .string()
  .min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد')
  .max(128, 'رمز عبور نمی‌تواند بیش از ۱۲۸ کاراکتر باشد')
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'رمز عبور باید شامل حرف و عدد باشد');

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Access token returned to the client; refresh token rides in an httpOnly cookie. */
export const authTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
