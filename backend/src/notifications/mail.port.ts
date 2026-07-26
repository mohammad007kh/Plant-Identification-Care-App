/** A single outbound email (subject/body already rendered — no templating here). */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Swappable email seam (US7, FR-020): email is the GUARANTEED primary
 * reminder channel, so feature code must never call nodemailer (or any SMTP
 * client) directly — always through this port. `SmtpMailAdapter` is the v1
 * implementation (Mailpit in dev, an Iranian relay in prod); tests mock this
 * interface instead of hitting real SMTP.
 */
export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

/** DI token for `MailPort` (Nest can't inject by interface type alone). */
export const MAIL_PORT = Symbol('MAIL_PORT');
