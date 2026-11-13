import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { tenantIntegrations } from "@/db/schema";
import type { ProviderConfig } from "@/integrations/identity";
import { decryptSecret } from "./secrets";

export type Provider = (typeof tenantIntegrations.$inferSelect)["provider"];

export const PROVIDERS: Record<Provider, { label: string; fields: { key: string; label: string }[]; secretLabel?: string; help: string }> = {
  google_workspace: {
    label: "Google Workspace",
    fields: [
      { key: "domain", label: "Primary domain" },
      { key: "adminEmail", label: "Admin email to impersonate" },
      { key: "defaultGroups", label: "Default groups (comma-separated emails)" },
    ],
    secretLabel: "Service account JSON key",
    help: "Service account with domain-wide delegation for the Admin SDK Directory API (user and group scopes).",
  },
  microsoft_365: {
    label: "Microsoft 365 / Entra ID",
    fields: [
      { key: "domain", label: "Primary domain" },
      { key: "tenantId", label: "Directory (tenant) ID" },
      { key: "clientId", label: "Application (client) ID" },
      { key: "usageLocation", label: "Usage location (e.g. LK)" },
      { key: "defaultGroups", label: "Default group IDs (comma-separated)" },
    ],
    secretLabel: "Client secret",
    help: "App registration with User.ReadWrite.All and GroupMember.ReadWrite.All application permissions.",
  },
  smtp: {
    label: "Email (SMTP)",
    fields: [
      { key: "host", label: "SMTP host" },
      { key: "port", label: "Port" },
      { key: "user", label: "Username" },
      { key: "from", label: "From address" },
    ],
    secretLabel: "Password",
    help: "Used for notifications, SLA alerts and renewal reminders.",
  },
  inbound_webhook: {
    label: "Inbound tickets (email, Teams, Slack, WhatsApp)",
    fields: [],
    secretLabel: "Shared secret",
    help: "Point your mail parser, Teams/Slack workflow or WhatsApp gateway at /api/inbound/<channel> with header x-crewlane-signature.",
  },
  device_agent: { label: "Device discovery agent", fields: [], help: "Create agent tokens below and run scripts/agent on endpoints." },
  intune: {
    label: "Microsoft Intune / Google endpoint sync",
    fields: [{ key: "source", label: "Source (intune or google)" }],
    help: "Uses the Microsoft 365 or Google credentials above to import managed devices.",
  },
};

export async function loadIntegration(tx: Tx, tenantId: string, provider: Provider): Promise<(ProviderConfig & { enabled: boolean }) | null> {
  const [row] = await tx
    .select()
    .from(tenantIntegrations)
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider)));
  if (!row) return null;
  return {
    enabled: row.enabled,
    mode: row.mode,
    config: row.config,
    secret: row.secretCiphertext ? decryptSecret(row.secretCiphertext) : null,
  };
}
