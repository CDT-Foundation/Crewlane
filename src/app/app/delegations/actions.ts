"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { delegations, employees } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";

const schema = z.object({
  delegateEmployeeId: z.uuid("Choose who covers for you."),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
  reason: z.string().trim().max(200),
  employeeId: z.string().optional(),
});

export async function createDelegationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act(null, async (tx, actor, ctx) => {
    const d = schema.parse(Object.fromEntries(fd));
    // Admins (HR) may set it up for someone else; everyone else for themselves.
    const forId = d.employeeId && ctx.can("employees.write") ? d.employeeId : ctx.employeeId;
    if (!forId) throw new UserError("Your login is not linked to an employee record.");
    if (forId === d.delegateEmployeeId) throw new UserError("Choose someone else to cover.");
    if (d.endsOn < d.startsOn) throw new UserError("The end date is before the start date.");
    const [e] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, d.delegateEmployeeId));
    if (!e) throw new UserError("Choose who covers for you.");
    const [row] = await tx
      .insert(delegations)
      .values({ tenantId: actor.tenantId, employeeId: forId, delegateEmployeeId: d.delegateEmployeeId, startsOn: d.startsOn, endsOn: d.endsOn, reason: d.reason || null })
      .returning({ id: delegations.id });
    await audit(tx, actor, { action: "delegation.created", entityType: "delegation", entityId: row.id, after: d });
    return "Saved. Approvals and tickets for you will go to your cover during these dates.";
  }, ["/app/delegations"]);
}

export async function deleteDelegationAction(id: string, _p: ActionState): Promise<ActionState> {
  return act(null, async (tx, actor, ctx) => {
    const [d] = await tx.select().from(delegations).where(eq(delegations.id, id));
    if (!d) throw new UserError("Not found.");
    if (d.employeeId !== ctx.employeeId && !ctx.can("employees.write")) throw new UserError("You can only remove your own.");
    await tx.delete(delegations).where(and(eq(delegations.id, id)));
    await audit(tx, actor, { action: "delegation.removed", entityType: "delegation", entityId: id });
    return "Removed.";
  }, ["/app/delegations"]);
}
