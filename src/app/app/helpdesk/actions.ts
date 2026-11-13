"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { slaPolicies, tickets } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { addComment, createTicket, rateTicket, updateTicket } from "@/lib/helpdesk";
import { ForbiddenError } from "@/lib/session";

const CATEGORIES = ["hardware", "software", "access", "network", "email", "onboarding", "offboarding", "facilities", "other"] as const;
const PRIORITIES = ["p1", "p2", "p3", "p4"] as const;
const STATUSES = ["new", "open", "in_progress", "waiting", "resolved", "closed"] as const;

export async function createTicketAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await act(null, async (tx, actor, ctx) => {
    const d = z
      .object({
        title: z.string().trim().min(4, "Give the problem a short title.").max(160),
        description: z.string().trim().min(5, "Describe the problem.").max(5000),
        category: z.enum(CATEGORIES),
        priority: z.enum(PRIORITIES),
        assetId: z.string().transform((v) => (v === "" ? null : v)),
      })
      .parse(Object.fromEntries(fd));
    // Requesters can't pick P1 for themselves unless they are agents.
    const priority = d.priority === "p1" && !ctx.can("helpdesk.agent") ? "p2" : d.priority;
    const t = await createTicket(tx, actor, { ...d, priority, requesterEmployeeId: ctx.employeeId, channel: "portal" });
    id = t.id;
  });
  if (res?.error) return res;
  redirect(`/app/helpdesk/${id}`);
}

export async function commentAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act(null, async (tx, actor, ctx) => {
    const body = String(fd.get("body") ?? "").trim();
    if (!body) throw new UserError("Write a message.");
    const [t] = await tx.select().from(tickets).where(eq(tickets.id, id));
    const agent = ctx.can("helpdesk.agent");
    if (!t || (!agent && t.requesterEmployeeId !== ctx.employeeId)) throw new ForbiddenError();
    await addComment(tx, actor, { ticketId: id, body, internal: agent && fd.get("internal") === "on", asAgent: agent });
    return "Sent.";
  }, [`/app/helpdesk/${id}`]);
}

export async function updateTicketAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("helpdesk.agent", async (tx, actor) => {
    const assignee = String(fd.get("assigneeEmployeeId") ?? "");
    await updateTicket(tx, actor, id, {
      status: z.enum(STATUSES).parse(fd.get("status")),
      priority: z.enum(PRIORITIES).parse(fd.get("priority")),
      category: z.enum(CATEGORIES).parse(fd.get("category")),
      assigneeEmployeeId: assignee === "" ? null : assignee,
    });
    return "Updated.";
  }, [`/app/helpdesk/${id}`, "/app/helpdesk"]);
}

export async function rateAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act(null, async (tx, actor, ctx) => {
    await rateTicket(tx, actor, id, ctx.employeeId, Number(fd.get("csat")), String(fd.get("comment") ?? "").trim() || null);
    return "Thanks for the feedback.";
  }, [`/app/helpdesk/${id}`]);
}

export async function saveSlaAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("helpdesk.manage", async (tx, actor) => {
    for (const p of PRIORITIES) {
      const response = Number(fd.get(`resp_${p}`));
      const resolve = Number(fd.get(`res_${p}`));
      if (!(response > 0 && resolve >= response)) throw new UserError(`${p.toUpperCase()}: resolve time must be at least the response time.`);
      await tx
        .update(slaPolicies)
        .set({ responseMinutes: Math.round(response * 60), resolveMinutes: Math.round(resolve * 60) })
        .where(eq(slaPolicies.priority, p));
    }
    await audit(tx, actor, { action: "sla.updated", entityType: "sla_policy", entityId: "all" });
    return "SLA targets saved. They apply to new tickets and priority changes.";
  }, ["/app/helpdesk/settings"]);
}
