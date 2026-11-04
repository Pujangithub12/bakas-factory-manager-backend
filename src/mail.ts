import nodemailer from "nodemailer";

/**
 * Email goes out over SMTP. Set SMTP_HOST (and SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM) in .env.
 * With no SMTP_HOST the message is printed in the server console instead, so the flow can be tried without a mail server.
 */
const host = process.env.SMTP_HOST;
const transport = host
  ? nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;
const FROM = process.env.MAIL_FROM || "Bakas Factory <no-reply@localhost>";

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`\n[mail not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, text });
}

/** Where the reset link points. From .env, never from the request, so a forged Host header cannot redirect the link. */
export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, "");
