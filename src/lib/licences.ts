import { and, count, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { licenceAssignments, softwareSubscriptions } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { resolveClearanceItemsFor } from "./clearance";
import { UserError } from "./errors";

export async function seatsUsed(tx: Tx, subscriptionId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(licenceAssignments)
    .where(and(eq(licenceAssignments.subscriptionId, subscriptionId), isNull(licenceAssignments.revokedAt)));
  return r.n;
}

export async function assignSeat(tx: Tx, actor: Actor, subscriptionId: string, employeeId: string) {
  const [sub] = await tx.select().from(softwareSubscriptions).where(eq(softwareSubscriptions.id, subscriptionId)).for("update");
  if (!sub) throw new UserError("Subscription not found.");
  const [dup] = await tx
    .select({ id: licenceAssignments.id })
    .from(licenceAssignments)
    .where(and(eq(licenceAssignments.subscriptionId, subscriptionId), eq(licenceAssignments.employeeId, employeeId), isNull(licenceAssignments.revokedAt)));
  if (dup) throw new UserError("This person already has a seat.");
  if ((await seatsUsed(tx, subscriptionId)) >= sub.seatsTotal) throw new UserError(`All ${sub.seatsTotal} seats are in use. Buy more seats or reclaim one.`);
  await tx.insert(licenceAssignments).values({ tenantId: actor.tenantId, subscriptionId, employeeId });
  await audit(tx, actor, { action: "licence.assigned", entityType: "software_subscription", entityId: subscriptionId, after: { employeeId } });
}

export async function revokeSeat(tx: Tx, actor: Actor, assignmentId: string) {
  const [a] = await tx
    .update(licenceAssignments)
    .set({ revokedAt: new Date() })
    .where(and(eq(licenceAssignments.id, assignmentId), isNull(licenceAssignments.revokedAt)))
    .returning();
  if (!a) throw new UserError("Seat not found or already reclaimed.");
  await audit(tx, actor, { action: "licence.reclaimed", entityType: "software_subscription", entityId: a.subscriptionId, after: { employeeId: a.employeeId } });
  await resolveClearanceItemsFor(tx, actor, "licence_reclaim", a.id, "done");
}

/** Annual cost of a subscription in its own currency. */
export function annualCost(s: { seatsTotal: number; costPerSeat: string; billingCycle: "monthly" | "annual" }) {
  const per = Number(s.costPerSeat) * s.seatsTotal;
  return s.billingCycle === "monthly" ? per * 12 : per;
}

/** Reminder windows reached for a renewal date: 30, 14 and 7 days ahead. */
export function dueReminderWindows(renewalDate: string, today: string, alreadySent: number[]) {
  const days = Math.round((Date.parse(renewalDate) - Date.parse(today)) / 864e5);
  return [30, 14, 7].filter((w) => days <= w && days >= 0 && !alreadySent.includes(w)).slice(-1);
}
