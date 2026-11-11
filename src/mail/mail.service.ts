import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface Provider {
  name: string;
  transport: Transporter;
}

/**
 * Sends mail through Maileroo first, then falls back to Google SMTP.
 * With no provider configured outside production, the message is logged instead
 * so signup and password reset can be tried locally.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly providers: Provider[] = [];
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.isProduction = config.get('NODE_ENV') === 'production';

    const mailerooUser = config.get<string>('MAILEROO_SMTP_USER');
    const mailerooPass = config.get<string>('MAILEROO_SMTP_PASS');
    if (mailerooUser && mailerooPass) {
      this.providers.push({
        name: 'maileroo',
        transport: nodemailer.createTransport({
          host: config.get('MAILEROO_SMTP_HOST', 'smtp.maileroo.com'),
          port: Number(config.get('MAILEROO_SMTP_PORT', 587)),
          secure: false,
          auth: { user: mailerooUser, pass: mailerooPass },
        }),
      });
    }

    const gmailUser = config.get<string>('GMAIL_USER');
    const gmailPass = config.get<string>('GMAIL_APP_PASSWORD');
    if (gmailUser && gmailPass) {
      this.providers.push({
        name: 'google-smtp',
        transport: nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: gmailUser, pass: gmailPass },
        }),
      });
    }

    this.from = config.get('MAIL_FROM') ?? gmailUser ?? 'no-reply@localhost';
    if (!this.providers.length && this.isProduction) {
      this.logger.error('No mail provider is configured; emails cannot be sent');
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.providers.length) {
      if (this.isProduction) throw new Error('No mail provider is configured');
      this.logger.warn(`[dev mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return;
    }

    for (const provider of this.providers) {
      try {
        await provider.transport.sendMail({ from: this.from, ...message });
        return;
      } catch (err) {
        this.logger.warn(`Mail provider ${provider.name} failed: ${(err as Error).message}`);
      }
    }
    throw new Error('All mail providers failed');
  }
}
