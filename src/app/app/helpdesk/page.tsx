import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table } from "@/components/ui";
import { employees, tickets } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { minutesLabel, slaState } from "@/lib/sla";
import { cn, formatDateTime } from "@/lib/utils";

const COLUMNS = [
  ["new", "New"], ["open", "Open"], ["in_progress", "In progress"], ["waiting", "Waiting on user"], ["resolved", "Resolved"],
] as const;
const slaTone = { met: "green", on_track: "green", at_risk: "amber", breached: "red", none: "gray" } as const;
const prioTone = { p1: "red", p2: "amber", p3: "blue", p4: "gray" } as const;

export default async function HelpdeskPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requirePage();
  const agent = ctx.can("helpdesk.agent");
  const { view = agent ? "all" : "mine" } = await searchParams;
  const now = new Date();
  const rows = await tenantTx(ctx, async (tx) => {
    const conds: (SQL | undefined)[] = [];
    if (!agent || view === "requested") conds.push(eq(tickets.requesterEmployeeId, ctx.employeeId ?? ""));
    else if (view === "mine") conds.push(or(eq(tickets.assigneeEmployeeId, ctx.employeeId ?? ""), eq(tickets.delegatedFromEmployeeId, ctx.employeeId ?? "")));
    else if (view === "unassigned") conds.push(isNull(tickets.assigneeEmployeeId));
    if (agent && view !== "requested") conds.push(inArray(tickets.status, ["new", "open", "in_progress", "waiting", "resolved"]));
    return tx
      .select({ t: tickets, first: employees.firstName, last: employees.lastName })
      .from(tickets)
      .leftJoin(employees, eq(employees.id, tickets.assigneeEmployeeId))
      .where(and(...conds))
      .orderBy(desc(tickets.createdAt))
      .limit(300);
  });

  const card = ({ t, first, last }: (typeof rows)[number]) => {
    const st = slaState(t, now);
    return (
      <Link key={t.id} href={`/app/helpdesk/${t.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xs hover:border-slate-300">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-slate-500">{t.number}</span>
          <Badge tone={prioTone[t.priority]}>{t.priority.toUpperCase()}</Badge>
          {t.channel !== "portal" ? <Badge>{t.channel}</Badge> : null}
        </div>
        <p className="font-medium leading-snug">{t.title}</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">{first ? `${first} ${last}` : "Unassigned"}</span>
          {t.resolveDueAt && st !== "met" ? <Badge tone={slaTone[st]}>{minutesLabel(t.resolveDueAt.getTime() - now.getTime())}</Badge> : null}
        </div>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={agent ? "Service desk" : "IT support"}
        description={agent ? "Tickets from the portal, email, Teams, Slack, WhatsApp and the system. Timers show time left on the resolution SLA." : "Report a problem or ask IT for help."}
        actions={
          <>
            {ctx.can("helpdesk.manage") ? <LinkButton href="/app/helpdesk/settings" variant="secondary">SLA targets</LinkButton> : null}
            <LinkButton href="/app/helpdesk/new">New ticket</LinkButton>
          </>
        }
      />
      {agent ? (
        <nav className="mb-4 flex gap-1 text-sm">
          {[["all", "All open"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["requested", "Raised by me"]].map(([k, label]) => (
            <Link key={k} href={`/app/helpdesk?view=${k}`} className={cn("rounded-md px-3 py-1.5", view === k ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100")}>{label}</Link>
          ))}
        </nav>
      ) : null}
      {agent && view !== "requested" ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {COLUMNS.map(([status, label]) => {
            const col = rows.filter((r) => r.t.status === status);
            return (
              <section key={status} className="min-w-52 rounded-xl bg-slate-100 p-2">
                <h2 className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}<span>{col.length}</span></h2>
                <div className="space-y-2">{col.map(card)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          {rows.length === 0 ? (
            <EmptyState>No tickets yet.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>No.</th><th>Title</th><th>Status</th><th>Raised</th></tr></thead>
              <tbody>
                {rows.map(({ t }) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs"><Link className="text-brand hover:underline" href={`/app/helpdesk/${t.id}`}>{t.number}</Link></td>
                    <td>{t.title}</td>
                    <td><Badge>{t.status.replace("_", " ")}</Badge></td>
                    <td className="text-xs text-slate-500">{formatDateTime(t.createdAt, ctx.tenant.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
