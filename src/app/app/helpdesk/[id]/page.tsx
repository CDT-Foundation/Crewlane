import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { assets, employees, ticketComments, tickets, user } from "@/db/schema";
import { agentEmployeeIds } from "@/lib/helpdesk";
import { requirePage, tenantTx } from "@/lib/session";
import { minutesLabel, slaState } from "@/lib/sla";
import { formatDateTime } from "@/lib/utils";
import { commentAction, rateAction, updateTicketAction } from "../actions";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage();
  const agent = ctx.can("helpdesk.agent");
  const data = await tenantTx(ctx, async (tx) => {
    const requester = alias(employees, "requester");
    const assignee = alias(employees, "assignee");
    const from = alias(employees, "delegated_from");
    const [row] = await tx
      .select({
        t: tickets, reqFirst: requester.firstName, reqLast: requester.lastName, asFirst: assignee.firstName, asLast: assignee.lastName,
        fromFirst: from.firstName, assetTag: assets.tag, assetName: assets.name,
      })
      .from(tickets)
      .leftJoin(requester, eq(requester.id, tickets.requesterEmployeeId))
      .leftJoin(assignee, eq(assignee.id, tickets.assigneeEmployeeId))
      .leftJoin(from, eq(from.id, tickets.delegatedFromEmployeeId))
      .leftJoin(assets, eq(assets.id, tickets.assetId))
      .where(eq(tickets.id, id));
    if (!row || (!agent && row.t.requesterEmployeeId !== ctx.employeeId)) return null;
    const comments = await tx
      .select({ c: ticketComments, name: user.name })
      .from(ticketComments)
      .leftJoin(user, eq(user.id, ticketComments.authorUserId))
      .where(eq(ticketComments.ticketId, id))
      .orderBy(asc(ticketComments.createdAt));
    const agents = agent ? await tx.select({ id: employees.id, first: employees.firstName, last: employees.lastName }).from(employees) : [];
    const agentIds = agent ? new Set(await agentEmployeeIds(tx)) : new Set<string>();
    return { ...row, comments: comments.filter((c) => agent || !c.c.internal), agents: agents.filter((a) => agentIds.has(a.id)) };
  });
  if (!data) notFound();
  const { t } = data;
  const tz = ctx.tenant.timezone;
  const now = new Date();
  const st = slaState(t, now);
  const isRequester = t.requesterEmployeeId === ctx.employeeId;

  return (
    <>
      <PageHeader
        title={`${t.number} · ${t.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{t.status.replace("_", " ")}</Badge>
            <Badge tone={t.priority === "p1" ? "red" : t.priority === "p2" ? "amber" : "blue"}>{t.priority.toUpperCase()}</Badge>
            <span>{t.category}</span>
            <span>· via {t.channel}</span>
            {t.resolveDueAt ? (
              <Badge tone={st === "breached" ? "red" : st === "at_risk" ? "amber" : "green"}>
                {st === "met" ? "SLA met" : `SLA ${minutesLabel(t.resolveDueAt.getTime() - now.getTime())}`}
              </Badge>
            ) : null}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <p className="mb-1 text-xs text-slate-500">
              {data.reqFirst ? `${data.reqFirst} ${data.reqLast}` : t.requesterContact ?? "System"} · {formatDateTime(t.createdAt, tz)}
            </p>
            <p className="whitespace-pre-wrap text-sm">{t.description}</p>
          </Card>
          {data.comments.map(({ c, name }) => (
            <div key={c.id} className={`rounded-xl border p-4 text-sm ${c.internal ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <p className="mb-1 text-xs text-slate-500">
                {name ?? c.authorLabel ?? "System"} · {formatDateTime(c.createdAt, tz)} {c.internal ? <Badge tone="amber">internal note</Badge> : null}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {t.status !== "closed" && (agent || isRequester) ? (
            <Card>
              <ActionForm action={commentAction.bind(null, t.id)} submitLabel="Send" resetOnSuccess>
                <Textarea name="body" rows={3} placeholder={agent ? "Reply to the requester, or add an internal note" : "Add more information"} required />
                {agent ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" /> Internal note (not visible to the requester)</label> : null}
              </ActionForm>
            </Card>
          ) : null}
          {isRequester && t.status === "resolved" && !t.csat ? (
            <Card title="How did we do?">
              <ActionForm action={rateAction.bind(null, t.id)} submitLabel="Rate and close">
                <Select name="csat" defaultValue="5" className="w-48">
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>)}
                </Select>
                <Textarea name="comment" rows={2} placeholder="Anything we could do better?" />
              </ActionForm>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-slate-500">Assigned to</dt><dd>{data.asFirst ? `${data.asFirst} ${data.asLast}` : "Unassigned"}{data.fromFirst ? <span className="text-slate-500"> (covering for {data.fromFirst})</span> : null}</dd></div>
              {t.assetId ? <div><dt className="text-slate-500">Asset</dt><dd><Link className="text-brand hover:underline" href={`/app/assets/${t.assetId}`}>{data.assetTag}</Link> {data.assetName}</dd></div> : null}
              <div><dt className="text-slate-500">Response due</dt><dd>{t.responseDueAt ? formatDateTime(t.responseDueAt, tz) : "—"}{t.firstResponseAt ? <span className="text-slate-500"> · responded {formatDateTime(t.firstResponseAt, tz)}</span> : null}</dd></div>
              <div><dt className="text-slate-500">Resolve due</dt><dd>{t.resolveDueAt ? formatDateTime(t.resolveDueAt, tz) : "—"}</dd></div>
              {t.csat ? <div><dt className="text-slate-500">Satisfaction</dt><dd>{"★".repeat(t.csat)}{"☆".repeat(5 - t.csat)} {t.csatComment ? `“${t.csatComment}”` : null}</dd></div> : null}
            </dl>
          </Card>
          {agent ? (
            <Card title="Update">
              <ActionForm action={updateTicketAction.bind(null, t.id)} submitLabel="Update ticket">
                <Field label="Status">
                  <Select name="status" defaultValue={t.status}>
                    {["new", "open", "in_progress", "waiting", "resolved", "closed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select name="priority" defaultValue={t.priority}>{["p1", "p2", "p3", "p4"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}</Select>
                </Field>
                <Field label="Category">
                  <Select name="category" defaultValue={t.category}>
                    {["hardware", "software", "access", "network", "email", "onboarding", "offboarding", "facilities", "other"].map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Assignee" hint="Anyone on leave is skipped automatically.">
                  <Select name="assigneeEmployeeId" defaultValue={t.assigneeEmployeeId ?? ""}>
                    <option value="">Unassigned</option>
                    {data.agents.map((a) => <option key={a.id} value={a.id}>{a.first} {a.last}</option>)}
                  </Select>
                </Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
