import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, identityAccounts, orgUnits } from "@/db/schema";
import { identityProvider, type IdentityProvider } from "@/integrations/identity";
import { audit, emit, type Actor } from "./audit";
import { resolveClearanceItemsFor } from "./clearance";
import { UserError } from "./errors";
import { loadIntegration } from "./integrations";
import { log } from "./log";
import { notifyPermission } from "./notify";

/** Hook for tests: replace the provider factory. */
export const providerFactory = { make: identityProvider };

async function providerFor(tx: Tx, tenantId: string, provider: "google_workspace" | "microsoft_365"): Promise<IdentityProvider> {
  const cfg = await loadIntegration(tx, tenantId, provider);
  if (!cfg || !cfg.enabled) throw new UserError(`${provider} is not configured.`);
  return providerFactory.make(provider, cfg);
}

export function tempPassword() {
  return `${randomBytes(9).toString("base64url")}aA7!`;
}

export async function provisionAccount(tx: Tx, tenantId: string, accountId: string) {
  const [acc] = await tx.select().from(identityAccounts).where(eq(identityAccounts.id, accountId)).for("update");
  if (!acc || (acc.status !== "pending" && acc.status !== "error")) return;
  const [e] = await tx
    .select({ e: employees, unit: orgUnits.name })
    .from(employees)
    .leftJoin(orgUnits, eq(orgUnits.id, employees.orgUnitId))
    .where(eq(employees.id, acc.employeeId));
  if (!e) return;
  const actor: Actor = { tenantId, userId: null };
  try {
    const p = await providerFor(tx, tenantId, acc.provider);
    const password = tempPassword();
    const { externalId } = await p.createUser({
      givenName: e.e.firstName, familyName: e.e.lastName, primaryEmail: acc.email, password, department: e.unit, jobTitle: e.e.jobTitle,
    });
    if (acc.groups.length) await p.addToGroups(externalId, acc.groups);
    await tx
      .update(identityAccounts)
      .set({ status: "active", externalId, lastAction: "created", lastError: null, updatedAt: new Date() })
      .where(eq(identityAccounts.id, acc.id));
    if (!e.e.workEmail) await tx.update(employees).set({ workEmail: acc.email }).where(eq(employees.id, e.e.id));
    await audit(tx, actor, { action: "identity.created", entityType: "identity_account", entityId: acc.id, after: { provider: acc.provider, email: acc.email } });
    // The temporary password goes only to the hire's personal email.
    if (e.e.personalEmail) {
      await emit(tx, tenantId, "email.send", {
        to: [e.e.personalEmail],
        subject: "Your new work account",
        text: `Your account ${acc.email} is ready. Temporary password: ${password}\nYou will be asked to change it when you first sign in.`,
      });
    }
    await notifyPermission(tx, tenantId, "identity.manage", {
      kind: "identity",
      title: `Account created: ${acc.email}`,
      body: e.e.personalEmail ? "The temporary password was emailed to the hire's personal address." : "No personal email on file: reset the password and give it to the hire in person.",
      href: "/app/identity",
      email: false,
    });
  } catch (err) {
    log.warn("identity provisioning failed", { accountId, error: String(err) });
    await tx
      .update(identityAccounts)
      .set({ status: "error", lastError: String(err).slice(0, 500), updatedAt: new Date() })
      .where(eq(identityAccounts.id, acc.id));
    await notifyPermission(tx, tenantId, "identity.manage", {
      kind: "identity", title: `Account creation failed: ${acc.email}`, body: String(err).slice(0, 200), href: "/app/identity",
    });
  }
}

/** Offboarding: kill sessions, then suspend. Clears the matching clearance item. */
export async function suspendAccount(tx: Tx, actor: Actor, accountId: string) {
  const [acc] = await tx.select().from(identityAccounts).where(eq(identityAccounts.id, accountId)).for("update");
  if (!acc) throw new UserError("Account not found.");
  if (acc.status === "suspended" || acc.status === "deleted") return;
  if (acc.externalId) {
    const p = await providerFor(tx, actor.tenantId, acc.provider);
    await p.revokeSessions(acc.externalId);
    await p.suspend(acc.externalId);
  }
  await tx
    .update(identityAccounts)
    .set({ status: "suspended", lastAction: "suspended", lastError: null, updatedAt: new Date() })
    .where(eq(identityAccounts.id, acc.id));
  await audit(tx, actor, { action: "identity.suspended", entityType: "identity_account", entityId: acc.id, after: { email: acc.email } });
  await resolveClearanceItemsFor(tx, actor, "account_revoke", acc.id, "done");
}

export async function resetAccountPassword(tx: Tx, actor: Actor, accountId: string) {
  const [acc] = await tx.select().from(identityAccounts).where(eq(identityAccounts.id, accountId));
  if (!acc?.externalId || acc.status !== "active") throw new UserError("Only active accounts can be reset.");
  const p = await providerFor(tx, actor.tenantId, acc.provider);
  const password = tempPassword();
  await p.resetPassword(acc.externalId, password);
  await tx.update(identityAccounts).set({ lastAction: "password_reset", updatedAt: new Date() }).where(eq(identityAccounts.id, acc.id));
  await audit(tx, actor, { action: "identity.password_reset", entityType: "identity_account", entityId: acc.id });
  return password;
}
