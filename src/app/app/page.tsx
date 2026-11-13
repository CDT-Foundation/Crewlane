import { and, count, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, PageHeader, statusTone } from "@/components/ui";
import { assets, employees, preboardingInvites, tickets } from "@/db/schema";
import { employeeScopeFilter, fullName } from "@/lib/employees";
import { formatDate } from "@/lib/letters";
import { pendingForMe } from "@/lib/queries";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow } from "@/lib/utils";

export default async function Overview() {
  const ctx = await requirePage();
  const scope = ctx.scope("employees.read");

  const data = await tenantTx(ctx, async (tx) => {
    const filter = scope ? employeeScopeFilter(scope, ctx.employeeId) : sql`false`;
    const byStatus = await tx
      .select({ status: employees.status, n: count() })
      .from(employees)
      .where(filter)
      .groupBy(employees.status);
    const in60 = isoDateFromNow(60);
    const today = isoDateFromNow(0);
    const expiring = await tx
      .select({
        id: employees.id, firstName: employees.firstName, lastName: employees.lastName,
        passportExpiry: employees.passportExpiry, visaExpiry: employees.visaExpiry,
      })
      .from(employees)
      .where(
        and(
          filter,
          or(
            and(isNotNull(employees.passportExpiry), lte(employees.passportExpiry, in60), gte(employees.passportExpiry, today)),
            and(isNotNull(employees.visaExpiry), lte(employees.visaExpiry, in60), gte(employees.visaExpiry, today)),
          ),
        ),
      )
      .limit(10);
    const openInvites = ctx.can("preboarding.manage")
      ? (await tx.select({ n: count() }).from(preboardingInvites).where(isNull(preboardingInvites.submittedAt)))[0].n
      : 0;
    const pending = await pendingForMe(tx, ctx);
    const [me] = ctx.employeeId
      ? await tx.select().from(employees).where(eq(employees.id, ctx.employeeId))
      : [];
    const myAssets = ctx.employeeId
      ? await tx.select({ id: assets.id, tag: assets.tag, name: assets.name }).from(assets).where(and(eq(assets.custodianEmployeeId, ctx.employeeId), eq(assets.status, "assigned")))
      : [];
    const myTickets = ctx.employeeId
      ? await tx.select().from(tickets).where(and(eq(tickets.requesterEmployeeId, ctx.employeeId), inArray(tickets.status, ["new", "open", "in_progress", "waiting", "resolved"]))).limit(5)
      : [];
    const desk = ctx.can("helpdesk.agent")
      ? {
          open: (await tx.select({ n: count() }).from(tickets).where(inArray(tickets.status, ["new", "open", "in_progress", "waiting"])))[0].n,
          breached: (await tx.select({ n: count() }).from(tickets).where(and(inArray(tickets.status, ["new", "open", "in_progress", "waiting"]), lt(tickets.resolveDueAt, new Date()))))[0].n,
          mine: (await tx.select({ n: count() }).from(tickets).where(and(eq(tickets.assigneeEmployeeId, ctx.employeeId ?? ""), inArray(tickets.status, ["new", "open", "in_progress", "waiting"]))))[0].n,
        }
      : null;
    return { byStatus, expiring, openInvites, pending, me, myAssets, myTickets, desk };
  });

  const total = data.byStatus.reduce((s, r) => s + r.n, 0);

  return (
    <>
      <PageHeader title={`Good day, ${ctx.user.name.split(" ")[0]}`} description={`${ctx.tenant.name} · ${ctx.tenant.country} · ${ctx.tenant.currency}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="People you can see" value={total} href={ctx.can("employees.read") ? "/app/employees" : undefined} />
        <Stat label="Waiting for your approval" value={data.pending.length} href={ctx.can("approvals.act") ? "/app/approvals" : undefined} />
        <Stat label="Pre-boarding forms outstanding" value={data.openInvites} />
        <Stat label="Passports or visas expiring in 60 days" value={data.expiring.length} />
      </div>

      {data.desk ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Open tickets" value={data.desk.open} href="/app/helpdesk" />
          <Stat label="Assigned to me" value={data.desk.mine} href="/app/helpdesk?view=mine" />
          <Stat label="Past their resolution SLA" value={data.desk.breached} href="/app/helpdesk" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Headcount by status">
          {data.byStatus.length === 0 ? (
            <p className="text-sm text-slate-500">No employees yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.byStatus.map((r) => (
                <li key={r.status} className="flex items-center justify-between text-sm">
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  <span className="font-medium">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Document expiry alerts">
          {data.expiring.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing expires in the next 60 days.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.expiring.map((e) => (
                <li key={e.id} className="flex justify-between gap-4">
                  <Link className="text-brand hover:underline" href={`/app/employees/${e.id}`}>{fullName(e)}</Link>
                  <span className="text-slate-600">
                    {e.passportExpiry ? `Passport ${formatDate(e.passportExpiry)}` : null}
                    {e.passportExpiry && e.visaExpiry ? " · " : null}
                    {e.visaExpiry ? `Visa ${formatDate(e.visaExpiry)}` : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="My equipment and support">
          {data.myAssets.length === 0 ? <p className="text-sm text-slate-500">No equipment issued to you.</p> : (
            <ul className="space-y-1 text-sm">
              {data.myAssets.map((a) => <li key={a.id}><Link className="font-mono text-brand hover:underline" href={`/app/assets/${a.id}`}>{a.tag}</Link> {a.name}</li>)}
            </ul>
          )}
          {data.myTickets.length ? (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              {data.myTickets.map((t) => <li key={t.id}><Link className="text-brand hover:underline" href={`/app/helpdesk/${t.id}`}>{t.number}</Link> {t.title} <Badge>{t.status.replace("_", " ")}</Badge></li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-4 text-sm">
            <Link className="text-brand hover:underline" href="/app/helpdesk/new">Report a problem</Link>
            <Link className="text-brand hover:underline" href="/app/assets/requests/new">Request equipment</Link>
          </div>
        </Card>

        {data.me ? (
          <Card title="My record">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Employee no.</dt><dd>{data.me.employeeNo}</dd></div>
              <div><dt className="text-slate-500">Job title</dt><dd>{data.me.jobTitle}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd><Badge tone={statusTone[data.me.status]}>{data.me.status}</Badge></dd></div>
              <div><dt className="text-slate-500">Joined</dt><dd>{formatDate(data.me.hireDate)}</dd></div>
            </dl>
            <Link className="mt-4 inline-block text-sm text-brand hover:underline" href={`/app/employees/${data.me.id}`}>Open my profile</Link>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
