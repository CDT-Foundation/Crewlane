import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { delegations, membershipRoles, memberships, roles } from "@/db/schema";
import { isoDateFromNow } from "./utils";

/**
 * Leave-aware routing: who should receive work meant for `employeeId` today.
 * Follows a chain (A delegates to B who is also away) up to 3 hops.
 */
export async function effectiveAssignee(tx: Tx, employeeId: string, onDate = isoDateFromNow(0)): Promise<string> {
  let current = employeeId;
  const seen = new Set([current]);
  for (let i = 0; i < 3; i++) {
    const [d] = await tx
      .select({ to: delegations.delegateEmployeeId })
      .from(delegations)
      .where(and(eq(delegations.employeeId, current), lte(delegations.startsOn, onDate), gte(delegations.endsOn, onDate)))
      .limit(1);
    if (!d || seen.has(d.to)) break;
    current = d.to;
    seen.add(current);
  }
  return current;
}

export async function isAway(tx: Tx, employeeId: string, onDate = isoDateFromNow(0)) {
  return (await effectiveAssignee(tx, employeeId, onDate)) !== employeeId;
}

/** Employees I am acting for today, and the role keys I inherit from them. */
export async function actingFor(tx: Tx, myEmployeeId: string | null, onDate = isoDateFromNow(0)) {
  if (!myEmployeeId) return { employeeIds: [] as string[], roleKeys: [] as string[] };
  const rows = await tx
    .select({ employeeId: delegations.employeeId })
    .from(delegations)
    .where(and(eq(delegations.delegateEmployeeId, myEmployeeId), lte(delegations.startsOn, onDate), gte(delegations.endsOn, onDate)));
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  if (employeeIds.length === 0) return { employeeIds, roleKeys: [] as string[] };
  const r = await tx
    .selectDistinct({ key: roles.key })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(inArray(memberships.employeeId, employeeIds));
  // Owner is never inherited through delegation.
  return { employeeIds, roleKeys: r.map((x) => x.key).filter((k) => k !== "owner") };
}
