"use server";

import { and, eq } from "drizzle-orm";
import { agentTokens, softwareBlocklist, tenantIntegrations } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { newToken } from "@/lib/crypto";
import { UserError } from "@/lib/errors";
import { PROVIDERS, type Provider } from "@/lib/integrations";
import { encryptSecret } from "@/lib/secrets";

export async function saveIntegrationAction(provider: Provider, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("integrations.manage", async (tx, actor) => {
    const spec = PROVIDERS[provider];
    const config: Record<string, string> = {};
    for (const f of spec.fields) config[f.key] = String(fd.get(f.key) ?? "").trim();
    const mode = fd.get("mode") === "live" ? "live" : "simulator";
    const enabled = fd.get("enabled") === "on";
    const secret = String(fd.get("secret") ?? "");
    if (mode === "live" && provider === "google_workspace" && secret) {
      try {
        const k = JSON.parse(secret);
        if (!k.client_email || !k.private_key) throw new Error();
      } catch {
        throw new UserError("Paste the full service account JSON key.");
      }
    }
    const values = {
      tenantId: actor.tenantId, provider, mode: mode as "live" | "simulator", enabled, config, updatedAt: new Date(),
      ...(secret ? { secretCiphertext: encryptSecret(secret) } : {}),
    };
    await tx.insert(tenantIntegrations).values(values).onConflictDoUpdate({
      target: [tenantIntegrations.tenantId, tenantIntegrations.provider],
      set: { mode: values.mode, enabled, config, updatedAt: values.updatedAt, ...(secret ? { secretCiphertext: values.secretCiphertext } : {}) },
    });
    // Never log secrets: only which fields changed.
    await audit(tx, actor, { action: "integration.saved", entityType: "integration", entityId: provider, after: { mode, enabled, config, secretChanged: Boolean(secret) } });
    return `${spec.label} saved (${mode}).`;
  }, ["/app/settings/integrations"]);
}

export async function createAgentTokenAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("integrations.manage", async (tx, actor) => {
    const name = String(fd.get("name") ?? "").trim() || "Agent token";
    const { token, hash } = newToken(24);
    await tx.insert(agentTokens).values({ tenantId: actor.tenantId, name, tokenHash: `${hash}` });
    await audit(tx, actor, { action: "agent_token.created", entityType: "agent_token", entityId: name });
    return `Token for "${name}" (shown once): cla_${token}`;
  }, ["/app/settings/integrations"]);
}

export async function revokeAgentTokenAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("integrations.manage", async (tx, actor) => {
    await tx.update(agentTokens).set({ revokedAt: new Date() }).where(and(eq(agentTokens.id, id)));
    await audit(tx, actor, { action: "agent_token.revoked", entityType: "agent_token", entityId: id });
    return "Revoked.";
  }, ["/app/settings/integrations"]);
}

export async function addBlockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("integrations.manage", async (tx, actor) => {
    const pattern = String(fd.get("pattern") ?? "").trim().toLowerCase();
    if (pattern.length < 3) throw new UserError("Enter at least 3 characters.");
    await tx.insert(softwareBlocklist).values({ tenantId: actor.tenantId, pattern }).onConflictDoNothing();
    return "Added.";
  }, ["/app/settings/integrations"]);
}

export async function removeBlockAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("integrations.manage", async (tx) => {
    await tx.delete(softwareBlocklist).where(eq(softwareBlocklist.id, id));
    return "Removed.";
  }, ["/app/settings/integrations"]);
}
