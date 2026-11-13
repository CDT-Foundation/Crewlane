/**
 * Periodic jobs, run by the worker. A transaction-scoped advisory lock makes
 * sure only one replica runs a tick. Each tenant runs in its own savepoint
 * with the tenant context set, so RLS still applies and one tenant's failure
 * does not affect the others.
 */
import { and, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import {
  clearanceItems, clearances, gatePasses, softwareSubscriptions, tenants, tickets,
} from "@/db/schema";
import type { Actor } from "@/lib/audit";
import { suspendAccount } from "@/lib/identity-jobs";
import { dueReminderWindows, revokeSeat } from "@/lib/licences";
import { log } from "@/lib/log";
import { notifyEmployees, notifyPermission } from "@/lib/notify";
import { isoDateFromNow } from "@/lib/utils";

const OPEN = ["new", "open", "in_progress", "waiting"] as const;

export async function slaBreaches(tx: Tx, tenantId: string, now = new Date()) {
  const due = await tx
    .select()
    .from(tickets)
    .where(and(inArray(tickets.status, [...OPEN]), lt(tickets.resolveDueAt, now), isNull(tickets.breachNotifiedAt)));
  for (const t of due) {
    await tx.update(tickets).set({ breachNotifiedAt: now }).where(eq(tickets.id, t.id));
    const note = { kind: "sla", title: `SLA breached: ${t.number} ${t.title}`, body: `Priority ${t.priority.toUpperCase()}`, href: `/app/helpdesk/${t.id}` };
    await notifyEmployees(tx, tenantId, [t.assigneeEmployeeId], note);
    await notifyPermission(tx, tenantId, "helpdesk.manage", { ...note, email: false });
  }
  return due.length;
}

export async function renewalReminders(tx: Tx, tenantId: string, today = isoDateFromNow(0)) {
  const subs = await tx
    .select()
    .from(softwareSubscriptions)
    .where(lte(softwareSubscriptions.renewalDate, isoDateFromNow(30)));
  let sent = 0;
  for (const s of subs) {
    const windows = dueReminderWindows(s.renewalDate, today, s.remindersSent);
    if (!windows.length) continue;
    // Mark the reached window and any larger ones as sent.
    const mark = [30, 14, 7].filter((w) => w >= windows[0]);
    await tx
      .update(softwareSubscriptions)
      .set({ remindersSent: [...new Set([...s.remindersSent, ...mark])] })
      .where(eq(softwareSubscriptions.id, s.id));
    const note = {
      kind: "renewal",
      title: `${s.product} renews in ${windows[0]} days or less (${s.renewalDate})`,
      body: `${s.seatsTotal} seats${s.autoRenew ? ", auto-renew is on" : ""}. Review seats before it renews.`,
      href: `/app/licences/${s.id}`,
    };
    await notifyPermission(tx, tenantId, "licences.manage", note);
    await notifyEmployees(tx, tenantId, [s.ownerEmployeeId], note);
    sent++;
  }
  return sent;
}

export async function overdueGatePasses(tx: Tx, tenantId: string, today = isoDateFromNow(0)) {
  const overdue = await tx
    .select()
    .from(gatePasses)
    .where(and(eq(gatePasses.status, "out"), lt(gatePasses.expectedReturnOn, today), isNull(gatePasses.overdueNotifiedAt)));
  for (const p of overdue) {
    await tx.update(gatePasses).set({ overdueNotifiedAt: new Date() }).where(eq(gatePasses.id, p.id));
    const note = { kind: "gate_pass", title: `Gate pass ${p.number} is overdue`, body: `${p.description} was due back on ${p.expectedReturnOn}.`, href: `/app/gate-passes/${p.id}` };
    await notifyPermission(tx, tenantId, "gatepass.manage", note);
    await notifyEmployees(tx, tenantId, [p.carrierEmployeeId], note);
  }
  return overdue.length;
}

/** On (or after) the last working day: suspend accounts and reclaim licence seats. */
export async function exitDayRevocations(tx: Tx, tenantId: string, today = isoDateFromNow(0)) {
  const actor: Actor = { tenantId, userId: null };
  const items = await tx
    .select({ item: clearanceItems })
    .from(clearanceItems)
    .innerJoin(clearances, eq(clearances.id, clearanceItems.clearanceId))
    .where(
      and(
        eq(clearances.status, "open"),
        lte(clearances.exitDate, today),
        eq(clearanceItems.status, "pending"),
        inArray(clearanceItems.type, ["account_revoke", "licence_reclaim"]),
      ),
    );
  let done = 0;
  for (const { item } of items) {
    if (!item.refId) continue;
    try {
      await tx.transaction(async (sp) => {
        if (item.type === "account_revoke") await suspendAccount(sp, actor, item.refId!);
        else await revokeSeat(sp, actor, item.refId!);
      });
      done++;
    } catch (err) {
      log.warn("exit-day revocation failed", { tenantId, itemId: item.id, error: String(err) });
    }
  }
  return done;
}

export async function runSchedulerTick(db: Db) {
  return db.transaction(async (tx) => {
    const [{ locked }] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('crewlane:scheduler')) as locked`);
    if (!locked) return { skipped: true };
    const all = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, "active"));
    const totals = { sla: 0, renewals: 0, gatePasses: 0, revocations: 0, failedTenants: 0 };
    for (const t of all) {
      try {
        await tx.transaction(async (sp) => {
          await sp.execute(sql`select set_config('app.tenant_id', ${t.id}, true)`);
          totals.sla += await slaBreaches(sp, t.id);
          totals.renewals += await renewalReminders(sp, t.id);
          totals.gatePasses += await overdueGatePasses(sp, t.id);
          totals.revocations += await exitDayRevocations(sp, t.id);
        });
      } catch (err) {
        totals.failedTenants++;
        log.error("scheduler failed for tenant", { tenantId: t.id, error: String(err) });
      }
    }
    return { skipped: false, ...totals };
  });
}
