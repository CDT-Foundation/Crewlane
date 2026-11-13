"use server";

import { eq } from "drizzle-orm";
import { employees, identityAccounts } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit, emit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { provisionAccount, resetAccountPassword, suspendAccount } from "@/lib/identity-jobs";
import { loadIntegration } from "@/lib/integrations";
import { suggestEmail } from "@/lib/onboarding";

export async function retryProvisionAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("identity.manage", async (tx, actor) => {
    await provisionAccount(tx, actor.tenantId, id);
    const [a] = await tx.select().from(identityAccounts).where(eq(identityAccounts.id, id));
    if (a?.status === "error") throw new UserError(`Still failing: ${a.lastError}`);
    return "Account created.";
  }, ["/app/identity"]);
}

export async function suspendAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("identity.manage", async (tx, actor) => {
    await suspendAccount(tx, actor, id);
    return "Sessions revoked and account suspended.";
  }, ["/app/identity"]);
}

export async function resetPasswordAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("identity.manage", async (tx, actor) => {
    const pw = await resetAccountPassword(tx, actor, id);
    return `Temporary password (shown once, they must change it at sign-in): ${pw}`;
  }, ["/app/identity"]);
}

export async function createAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("identity.manage", async (tx, actor) => {
    const employeeId = String(fd.get("employeeId") ?? "");
    const provider = fd.get("provider") === "microsoft_365" ? "microsoft_365" : "google_workspace";
    const cfg = await loadIntegration(tx, actor.tenantId, provider);
    if (!cfg?.enabled) throw new UserError("Enable this provider in Integrations first.");
    const [e] = await tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!e) throw new UserError("Choose an employee.");
    const email = String(fd.get("email") ?? "").trim().toLowerCase() || suggestEmail(e.firstName, e.lastName, cfg.config.domain || "example.com");
    const groups = (cfg.config.defaultGroups ?? "").split(",").map((g) => g.trim()).filter(Boolean);
    const [acc] = await tx.insert(identityAccounts).values({ tenantId: actor.tenantId, employeeId, provider, email, groups }).onConflictDoNothing().returning();
    if (!acc) throw new UserError("This employee already has an account with that provider.");
    await audit(tx, actor, { action: "identity.requested", entityType: "identity_account", entityId: acc.id, after: { email, provider } });
    await emit(tx, actor.tenantId, "identity.provision", { accountId: acc.id });
    return `Queued: ${email}. The worker creates it within a minute.`;
  }, ["/app/identity"]);
}
