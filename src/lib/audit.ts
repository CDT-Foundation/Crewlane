import { auditLog, outboxEvents } from "@/db/schema";
import type { Tx } from "@/db/client";

export type Actor = { tenantId: string; userId: string | null; ip?: string | null };

/**
 * Appends to the tenant's audit trail inside the caller's transaction, so the
 * entry commits or rolls back with the change it describes. The database
 * assigns the sequence number and hash-chain fields.
 */
export async function audit(
  tx: Tx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLog).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    ip: actor.ip ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/**
 * Transactional outbox: the event is written in the same transaction as the
 * business change and picked up by the worker (src/worker). This is the event
 * bus that lets an HR action trigger IT and payroll work in later phases.
 */
export async function emit(tx: Tx, tenantId: string, type: string, payload: Record<string, unknown>) {
  await tx.insert(outboxEvents).values({ tenantId, type, payload });
}

/** Returns only the keys that changed, for compact before/after audit rows. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const nv = after[key];
    const ov = before[key];
    if (nv !== undefined && JSON.stringify(nv) !== JSON.stringify(ov)) {
      b[key] = ov ?? null;
      a[key] = nv;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
