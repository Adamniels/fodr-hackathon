// Outgoing mail behind a small interface (ADR 0005), so the provider is configuration: SMTP to Mailpit locally
// (ADR 0006), to the transactional email provider in production (M5).
import { createTransport } from 'nodemailer'
import type { Config } from '../config'

export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function createSmtpMailer(
  config: Pick<Config, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPassword' | 'mailFrom'>,
): Mailer {
  const transport = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    // Implicit TLS on 465; on other ports nodemailer upgrades with STARTTLS when the server offers it.
    secure: config.smtpPort === 465,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
  })
  return {
    async send(mail) {
      await transport.sendMail({ from: config.mailFrom, ...mail })
    },
  }
}
