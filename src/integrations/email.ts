/** Outbound email: SMTP in live mode, a structured log line in simulator mode. */
import nodemailer from "nodemailer";
import { log } from "@/lib/log";
import type { ProviderConfig } from "./identity";

export type Mail = { to: string[]; subject: string; text: string };

export async function sendMail(cfg: ProviderConfig | null, mail: Mail) {
  if (!cfg || cfg.mode === "simulator") {
    log.info("email (simulated)", { to: mail.to, subject: mail.subject });
    return { simulated: true };
  }
  const transport = nodemailer.createTransport({
    host: cfg.config.host,
    port: Number(cfg.config.port || 587),
    secure: cfg.config.port === "465",
    auth: cfg.config.user ? { user: cfg.config.user, pass: cfg.secret ?? "" } : undefined,
  });
  await transport.sendMail({ from: cfg.config.from, to: mail.to, subject: mail.subject, text: mail.text });
  return { simulated: false };
}
