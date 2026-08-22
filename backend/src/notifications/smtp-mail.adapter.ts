import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailPort } from './mail.port';

/**
 * SMTP implementation of `MailPort` (Mailpit in dev per docker-compose;
 * the Iranian relay in prod per registry `email.transactional_provider`).
 * Only this adapter is allowed to import `nodemailer` — everything else
 * depends on `MailPort` (Station 11 rule). The transporter is built lazily
 * from env so importing this module never forces a network/DNS lookup.
 */
@Injectable()
export class SmtpMailAdapter implements MailPort {
  private transporter?: Transporter;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'localhost',
        port: Number(process.env.SMTP_PORT ?? 21025),
        secure: false,
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    await this.getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@plantcare.local',
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
