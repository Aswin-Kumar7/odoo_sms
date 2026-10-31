import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: string; // e.g. "password_reset", "invoice"
}

const transporter: Transporter | null = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Sends an email when SMTP is configured; otherwise prints it to the server console.
 * Every attempt is recorded in email_log. Returns false on delivery failure so the
 * caller decides whether that is fatal (invoice send) or not (password reset).
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!transporter) {
    console.log(`\n──── email (${mail.kind}) ────\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n─────────────────────────\n`);
    await logEmail(mail, "LOGGED");
    return true;
  }
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    await logEmail(mail, "SENT");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Email to ${mail.to} failed: ${message}`);
    await logEmail(mail, "FAILED", message);
    return false;
  }
}

async function logEmail(mail: Mail, status: "SENT" | "FAILED" | "LOGGED", error?: string) {
  await prisma.emailLog
    .create({ data: { to: mail.to, subject: mail.subject, kind: mail.kind, status, error } })
    .catch((e) => console.error("email_log write failed:", e));
}
