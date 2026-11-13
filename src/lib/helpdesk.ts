import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, membershipRoles, memberships, roles, slaPolicies, ticketComments, tickets } from "@/db/schema";
import { audit, emit, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { effectiveAssignee } from "./delegations";
import { UserError } from "./errors";
import { notifyEmployees, notifyUsers, userIdsForEmployees } from "./notify";
import { dueDates } from "./sla";

type Ticket = typeof tickets.$inferSelect;
export const OPEN_STATUSES = ["new", "open", "in_progress", "waiting"] as const;

/** Employees who can work tickets (members with helpdesk.agent). */
export async function agentEmployeeIds(tx: Tx) {
  const rows = await tx
    .selectDistinct({ employeeId: memberships.employeeId })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(employees, eq(employees.id, memberships.employeeId))
    .where(
      and(
        eq(memberships.active, true),
        sql`'helpdesk.agent' = any(${roles.permissions})`,
        notInArray(employees.status, ["resigned", "terminated"]),
      ),
    );
  return rows.map((r) => r.employeeId!).filter(Boolean);
}

/**
 * Least-loaded available agent. Agents on leave are skipped; if everyone is
 * away, the work goes to whoever is acting for the least-loaded agent.
 */
export async function pickAssignee(tx: Tx): Promise<{ assignee: string | null; delegatedFrom: string | null }> {
  const agents = await agentEmployeeIds(tx);
  if (agents.length === 0) return { assignee: null, delegatedFrom: null };
  const loads = await tx
    .select({ id: tickets.assigneeEmployeeId, n: count() })
    .from(tickets)
    .where(and(inArray(tickets.assigneeEmployeeId, agents), inArray(tickets.status, [...OPEN_STATUSES])))
    .groupBy(tickets.assigneeEmployeeId);
  const load = new Map(loads.map((l) => [l.id, l.n]));
  const ranked = [...agents].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
  for (const a of ranked) {
    if ((await effectiveAssignee(tx, a)) === a) return { assignee: a, delegatedFrom: null };
  }
  const first = ranked[0];
  return { assignee: await effectiveAssignee(tx, first), delegatedFrom: first };
}

export type NewTicket = {
  title: string;
  description: string;
  category: Ticket["category"];
  priority?: Ticket["priority"];
  channel?: Ticket["channel"];
  requesterEmployeeId?: string | null;
  requesterContact?: string | null;
  assetId?: string | null;
  externalRef?: string | null;
};

export async function createTicket(tx: Tx, actor: Actor, input: NewTicket) {
  const priority = input.priority ?? "p3";
  const [policy] = await tx.select().from(slaPolicies).where(eq(slaPolicies.priority, priority));
  const now = new Date();
  const due = policy ? dueDates(now, policy) : { responseDueAt: null, resolveDueAt: null };
  const { assignee, delegatedFrom } = await pickAssignee(tx);
  const number = await nextNumber(tx, "ticket", "T");
  const [t] = await tx
    .insert(tickets)
    .values({
      tenantId: actor.tenantId,
      number,
      title: input.title,
      description: input.description,
      category: input.category,
      priority,
      channel: input.channel ?? "portal",
      requesterEmployeeId: input.requesterEmployeeId ?? null,
      requesterContact: input.requesterContact ?? null,
      assetId: input.assetId ?? null,
      externalRef: input.externalRef ?? null,
      assigneeEmployeeId: assignee,
      delegatedFromEmployeeId: delegatedFrom,
      responseDueAt: due.responseDueAt,
      resolveDueAt: due.resolveDueAt,
      createdAt: now,
    })
    .returning();
  await audit(tx, actor, { action: "ticket.created", entityType: "ticket", entityId: t.id, after: { number, priority, channel: t.channel, assignee } });
  await emit(tx, actor.tenantId, "ticket.created", { ticketId: t.id, number });
  if (assignee) {
    await notifyEmployees(tx, actor.tenantId, [assignee], {
      kind: "ticket",
      title: `${number} assigned to you: ${t.title}`,
      body: delegatedFrom ? "Routed to you because the usual agent is on leave." : undefined,
      href: `/app/helpdesk/${t.id}`,
    });
  }
  return t;
}

export async function addComment(
  tx: Tx,
  actor: Actor,
  input: { ticketId: string; body: string; internal: boolean; asAgent: boolean; authorLabel?: string },
) {
  const [t] = await tx.select().from(tickets).where(eq(tickets.id, input.ticketId)).for("update");
  if (!t) throw new UserError("Ticket not found.");
  if (t.status === "closed") throw new UserError("This ticket is closed.");
  if (input.internal && !input.asAgent) throw new UserError("Only agents can add internal notes.");
  await tx.insert(ticketComments).values({
    tenantId: actor.tenantId, ticketId: t.id, authorUserId: actor.userId, authorLabel: input.authorLabel ?? null,
    body: input.body, internal: input.internal,
  });
  const patch: Partial<Ticket> = { updatedAt: new Date() };
  if (input.asAgent && !input.internal && !t.firstResponseAt) patch.firstResponseAt = new Date();
  if (input.asAgent && t.status === "new") patch.status = "open";
  if (!input.asAgent && (t.status === "waiting" || t.status === "resolved")) patch.status = "open";
  await tx.update(tickets).set(patch).where(eq(tickets.id, t.id));
  if (!input.internal) {
    const target = input.asAgent ? [t.requesterEmployeeId] : [t.assigneeEmployeeId];
    await notifyEmployees(tx, actor.tenantId, target, { kind: "ticket", title: `New reply on ${t.number}`, body: input.body.slice(0, 200), href: `/app/helpdesk/${t.id}` });
  }
}

export async function updateTicket(
  tx: Tx,
  actor: Actor,
  ticketId: string,
  patch: { status?: Ticket["status"]; priority?: Ticket["priority"]; assigneeEmployeeId?: string | null; category?: Ticket["category"] },
) {
  const [t] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).for("update");
  if (!t) throw new UserError("Ticket not found.");
  const next: Partial<Ticket> = { updatedAt: new Date() };
  if (patch.status && patch.status !== t.status) {
    next.status = patch.status;
    if (patch.status === "resolved") next.resolvedAt = new Date();
    if (patch.status === "closed") next.closedAt = new Date();
    if (OPEN_STATUSES.includes(patch.status as (typeof OPEN_STATUSES)[number])) {
      next.resolvedAt = null;
      next.closedAt = null;
    }
    if (patch.status !== "new" && !t.firstResponseAt) next.firstResponseAt = new Date();
  }
  if (patch.priority && patch.priority !== t.priority) {
    next.priority = patch.priority;
    const [policy] = await tx.select().from(slaPolicies).where(eq(slaPolicies.priority, patch.priority));
    if (policy) Object.assign(next, dueDates(t.createdAt, policy), { breachNotifiedAt: null });
  }
  if (patch.category) next.category = patch.category;
  if (patch.assigneeEmployeeId !== undefined && patch.assigneeEmployeeId !== t.assigneeEmployeeId) {
    if (patch.assigneeEmployeeId) {
      const routed = await effectiveAssignee(tx, patch.assigneeEmployeeId);
      next.assigneeEmployeeId = routed;
      next.delegatedFromEmployeeId = routed !== patch.assigneeEmployeeId ? patch.assigneeEmployeeId : null;
      await notifyEmployees(tx, actor.tenantId, [routed], { kind: "ticket", title: `${t.number} assigned to you: ${t.title}`, href: `/app/helpdesk/${t.id}` });
    } else {
      next.assigneeEmployeeId = null;
      next.delegatedFromEmployeeId = null;
    }
  }
  await tx.update(tickets).set(next).where(eq(tickets.id, ticketId));
  await audit(tx, actor, {
    action: "ticket.updated", entityType: "ticket", entityId: ticketId,
    before: { status: t.status, priority: t.priority, assignee: t.assigneeEmployeeId },
    after: { status: next.status, priority: next.priority, assignee: next.assigneeEmployeeId },
  });
  if (next.status === "resolved") {
    await notifyUsers(tx, actor.tenantId, await userIdsForEmployees(tx, [t.requesterEmployeeId]), {
      kind: "ticket", title: `${t.number} resolved`, body: "Rate the support you received.", href: `/app/helpdesk/${t.id}`,
    });
  }
}

export async function rateTicket(tx: Tx, actor: Actor, ticketId: string, employeeId: string | null, csat: number, comment: string | null) {
  const [t] = await tx.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!t) throw new UserError("Ticket not found.");
  if (!employeeId || t.requesterEmployeeId !== employeeId) throw new UserError("Only the requester can rate this ticket.");
  if (t.status !== "resolved" && t.status !== "closed") throw new UserError("You can rate a ticket once it is resolved.");
  if (csat < 1 || csat > 5) throw new UserError("Choose 1 to 5 stars.");
  await tx.update(tickets).set({ csat, csatComment: comment, status: "closed", closedAt: t.closedAt ?? new Date() }).where(eq(tickets.id, ticketId));
  await audit(tx, actor, { action: "ticket.rated", entityType: "ticket", entityId: ticketId, after: { csat } });
}
