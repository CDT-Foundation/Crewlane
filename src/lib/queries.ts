import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { approvalRequests } from "@/db/schema";
import { type AppContext, approverIdentity } from "./session";

/**
 * Pending requests whose current step this user may decide: steps for one of
 * their roles, steps addressed to them as line manager, and the same for
 * anyone they are covering for while that person is on leave.
 */
export function pendingForMe(tx: Tx, ctx: AppContext) {
  const { roles, employeeIds } = approverIdentity(ctx);
  if (!ctx.can("approvals.act") && ctx.actingFor.employeeIds.length === 0 && employeeIds.length === 0) return Promise.resolve([]);
  const isOwner = roles.includes("owner");
  const step = sql`(${approvalRequests.steps} -> ${approvalRequests.currentStep})`;
  const list = (xs: string[]) => sql.join(xs.map((k) => sql`${k}`), sql`, `);
  const byRole = roles.length ? sql`(${step} ->> 'approverEmployeeId' is null and ${step} ->> 'approverRole' in (${list(roles)}))` : sql`false`;
  const byPerson = employeeIds.length ? sql`(${step} ->> 'approverEmployeeId' in (${list(employeeIds)}))` : sql`false`;
  return tx
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.status, "pending"),
        isOwner ? undefined : or(byRole, byPerson),
        or(eq(approvalRequests.makerChecker, false), ne(approvalRequests.requestedBy, ctx.user.id)),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(100);
}
