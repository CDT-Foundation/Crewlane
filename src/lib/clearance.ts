/**
 * Offboarding gate. When an exit is approved, a clearance lists everything
 * the person holds: assets, accounts, licences, gate passes and phone lines.
 * Final settlement and gratuity stay blocked until every item is done,
 * waived or recovered through a payroll deduction.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  assets, clearanceItems, clearances, employees, gatePasses, identityAccounts, licenceAssignments,
  softwareSubscriptions, telecomLines,
} from "@/db/schema";
import { audit, emit, type Actor } from "./audit";
import { UserError } from "./errors";
import { notifyPermission } from "./notify";

type ItemType = (typeof clearanceItems.$inferSelect)["type"];

export async function openClearance(tx: Tx, actor: Actor, employeeId: string, exitDate: string | null) {
  const [existing] = await tx.select().from(clearances).where(eq(clearances.employeeId, employeeId));
  if (existing) return existing;
  const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new UserError("Employee not found.");

  const [c] = await tx
    .insert(clearances)
    .values({ tenantId: actor.tenantId, employeeId, exitDate })
    .returning();

  const items: { type: ItemType; refId: string | null; description: string }[] = [];
  for (const a of await tx.select().from(assets).where(and(eq(assets.custodianEmployeeId, employeeId), eq(assets.status, "assigned")))) {
    items.push({ type: "asset_return", refId: a.id, description: `Return ${a.tag} ${a.name}` });
  }
  for (const acc of await tx
    .select()
    .from(identityAccounts)
    .where(and(eq(identityAccounts.employeeId, employeeId), inArray(identityAccounts.status, ["active", "pending", "error"])))) {
    items.push({ type: "account_revoke", refId: acc.id, description: `Suspend ${acc.provider === "google_workspace" ? "Google" : "Microsoft 365"} account ${acc.email}` });
  }
  for (const l of await tx
    .select({ id: licenceAssignments.id, product: softwareSubscriptions.product })
    .from(licenceAssignments)
    .innerJoin(softwareSubscriptions, eq(softwareSubscriptions.id, licenceAssignments.subscriptionId))
    .where(and(eq(licenceAssignments.employeeId, employeeId), isNull(licenceAssignments.revokedAt)))) {
    items.push({ type: "licence_reclaim", refId: l.id, description: `Reclaim ${l.product} seat` });
  }
  for (const g of await tx
    .select()
    .from(gatePasses)
    .where(and(eq(gatePasses.carrierEmployeeId, employeeId), eq(gatePasses.status, "out"), eq(gatePasses.type, "returnable")))) {
    items.push({ type: "gate_pass", refId: g.id, description: `Bring back items on gate pass ${g.number}` });
  }
  for (const line of await tx.select().from(telecomLines).where(and(eq(telecomLines.employeeId, employeeId), eq(telecomLines.active, true)))) {
    items.push({ type: "telecom_line", refId: line.id, description: `Return or transfer mobile line ${line.number}` });
  }
  if (items.length) {
    await tx.insert(clearanceItems).values(items.map((i) => ({ tenantId: actor.tenantId, clearanceId: c.id, ...i })));
  }
  await audit(tx, actor, { action: "clearance.opened", entityType: "clearance", entityId: c.id, after: { employeeId, items: items.length } });
  await emit(tx, actor.tenantId, "clearance.opened", { clearanceId: c.id, employeeId, exitDate });
  await notifyPermission(tx, actor.tenantId, "offboarding.manage", {
    kind: "clearance",
    title: `Exit clearance opened for ${emp.firstName} ${emp.lastName}`,
    body: `${items.length} item(s) to clear. Final settlement is blocked until they are done.`,
    href: `/app/offboarding/${c.id}`,
  });
  await recomputeClearance(tx, actor, c.id);
  return c;
}

export async function recomputeClearance(tx: Tx, actor: Actor, clearanceId: string) {
  const [c] = await tx.select().from(clearances).where(eq(clearances.id, clearanceId));
  if (!c || c.status !== "open") return c;
  const items = await tx.select().from(clearanceItems).where(eq(clearanceItems.clearanceId, clearanceId));
  if (items.some((i) => i.status === "pending")) return c;
  const [updated] = await tx
    .update(clearances)
    .set({ status: "cleared", settlementBlocked: false, clearedAt: new Date() })
    .where(eq(clearances.id, clearanceId))
    .returning();
  await audit(tx, actor, { action: "clearance.cleared", entityType: "clearance", entityId: clearanceId });
  await emit(tx, actor.tenantId, "clearance.cleared", { clearanceId, employeeId: c.employeeId });
  await notifyPermission(tx, actor.tenantId, "offboarding.manage", {
    kind: "clearance", title: "Exit clearance complete: final settlement can be released", href: `/app/offboarding/${clearanceId}`,
  });
  return updated;
}

/** Marks pending items for a referenced record (asset, account, ...) in any open clearance. */
export async function resolveClearanceItemsFor(
  tx: Tx,
  actor: Actor,
  type: ItemType,
  refId: string,
  status: "done" | "lost" | "waived",
  deductionId: string | null = null,
) {
  const rows = await tx
    .update(clearanceItems)
    .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), deductionId })
    .where(and(eq(clearanceItems.type, type), eq(clearanceItems.refId, refId), eq(clearanceItems.status, "pending")))
    .returning({ clearanceId: clearanceItems.clearanceId });
  for (const r of rows) await recomputeClearance(tx, actor, r.clearanceId);
}

export async function resolveItemManually(tx: Tx, actor: Actor, itemId: string, status: "done" | "waived") {
  const [item] = await tx.select().from(clearanceItems).where(eq(clearanceItems.id, itemId));
  if (!item) throw new UserError("Item not found.");
  if (item.status !== "pending") throw new UserError("This item is already resolved.");
  if (item.type === "asset_return" && status === "done") {
    throw new UserError("Record the return on the asset itself so custody stays accurate.");
  }
  await tx
    .update(clearanceItems)
    .set({ status, resolvedBy: actor.userId, resolvedAt: new Date() })
    .where(eq(clearanceItems.id, itemId));
  await audit(tx, actor, { action: `clearance.item_${status}`, entityType: "clearance", entityId: item.clearanceId, after: { item: item.description } });
  await recomputeClearance(tx, actor, item.clearanceId);
}

export async function overrideClearance(tx: Tx, actor: Actor, clearanceId: string, reason: string) {
  const [c] = await tx.select().from(clearances).where(eq(clearances.id, clearanceId));
  if (!c) throw new UserError("Clearance not found.");
  if (c.status !== "open") throw new UserError("Only open clearances can be overridden.");
  await tx
    .update(clearances)
    .set({ status: "overridden", settlementBlocked: false, overrideReason: reason, clearedAt: new Date() })
    .where(eq(clearances.id, clearanceId));
  await audit(tx, actor, { action: "clearance.overridden", entityType: "clearance", entityId: clearanceId, after: { reason } });
}

/** For payroll (Phase 3): is this employee's final settlement still blocked? */
export async function settlementBlocked(tx: Tx, employeeId: string) {
  const [c] = await tx.select({ blocked: clearances.settlementBlocked }).from(clearances).where(eq(clearances.employeeId, employeeId));
  return c?.blocked ?? false;
}
