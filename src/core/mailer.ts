import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { contactEmail } from "./site.ts";

/*
 * Sending email. Works with any provider that offers SMTP (Postmark, Resend,
 * Amazon SES, Mailgun, Fastmail, …):
 *
 *   SMTP_URL=smtps://user:password@smtp.example.com:465
 *   MAIL_FROM="Fine Print <updates@fineprint.example.com>"
 *
 * For local testing, set MAIL_OUTBOX_DIR instead: each email is written to
 * that folder as an .eml file (open it in any mail app) and nothing is sent.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export class MailNotConfigured extends Error {}

let transport: Transporter | null = null;

/**
 * The site's address, for links in emails, without a trailing slash. Real
 * email (SMTP_URL) needs FINEPRINT_SITE_URL set, so a copy of the site never
 * sends links that point at someone else's. Test mail defaults to localhost.
 */
export function siteUrl(): string | null {
  const configured = process.env.FINEPRINT_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.SMTP_URL ? null : "http://localhost:3000";
}

export function mailConfigured(): boolean {
  return Boolean((process.env.SMTP_URL || process.env.MAIL_OUTBOX_DIR) && process.env.MAIL_FROM && siteUrl());
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from || !(process.env.SMTP_URL || process.env.MAIL_OUTBOX_DIR)) {
    throw new MailNotConfigured("Email is not set up. Set MAIL_FROM and SMTP_URL (or MAIL_OUTBOX_DIR for testing).");
  }
  const message = {
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    headers: mail.headers,
    // Replies go to a person, even when the sending address is a no-reply one.
    replyTo: contactEmail(),
  };

  if (process.env.SMTP_URL) {
    // Fail in seconds, not minutes, when the mail server stalls.
    transport ??= nodemailer.createTransport({
      url: process.env.SMTP_URL,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    await transport.sendMail(message);
    return;
  }

  const outbox = path.resolve(process.env.MAIL_OUTBOX_DIR!);
  const raw = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail(message);
  await mkdir(outbox, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mail.to.replace(/[^\w.@-]/g, "_")}.eml`;
  await writeFile(path.join(outbox, name), raw.message as Buffer);
}
