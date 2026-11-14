import type { ReactNode } from "react";
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, statusTone } from "@/components/ui";
import { assets, employees, preboardingInvites, tickets } from "@/db/schema";
import { employeeScopeFilter, fullName } from "@/lib/employees";
import { formatDate } from "@/lib/letters";
import { pendingForMe } from "@/lib/queries";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow } from "@/lib/utils";
import {
  UsersIcon,
  TicketIcon,
  LaptopIcon,
  BoltIcon,
  DocumentTextIcon,
  CalendarIcon,
  UserIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from "@/components/icons";

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
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        passportExpiry: employees.passportExpiry,
        visaExpiry: employees.visaExpiry,
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
    const [me] = ctx.employeeId ? await tx.select().from(employees).where(eq(employees.id, ctx.employeeId)) : [];
    const myAssets = ctx.employeeId
      ? await tx
          .select({ id: assets.id, tag: assets.tag, name: assets.name })
          .from(assets)
          .where(and(eq(assets.custodianEmployeeId, ctx.employeeId), eq(assets.status, "assigned")))
      : [];
    const myTickets = ctx.employeeId
      ? await tx
          .select()
          .from(tickets)
          .where(and(eq(tickets.requesterEmployeeId, ctx.employeeId), inArray(tickets.status, ["new", "open", "in_progress", "waiting", "resolved"])))
          .limit(5)
      : [];
    const desk = ctx.can("helpdesk.agent")
      ? {
          open: (await tx.select({ n: count() }).from(tickets).where(inArray(tickets.status, ["new", "open", "in_progress", "waiting"])))[0].n,
          breached: (
            await tx
              .select({ n: count() })
              .from(tickets)
              .where(and(inArray(tickets.status, ["new", "open", "in_progress", "waiting"]), lt(tickets.resolveDueAt, new Date())))
          )[0].n,
          mine: (
            await tx
              .select({ n: count() })
              .from(tickets)
              .where(and(eq(tickets.assigneeEmployeeId, ctx.employeeId ?? ""), inArray(tickets.status, ["new", "open", "in_progress", "waiting"])))
          )[0].n,
        }
      : null;
    return { byStatus, expiring, openInvites, pending, me, myAssets, myTickets, desk };
  });

  const total = data.byStatus.reduce((s, r) => s + r.n, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Welcome Glass Banner */}
      <section className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 shadow-xl">
        {/* Subtle Decorative Gradient Mesh Accent */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-gradient-to-br from-brand/20 via-indigo-500/15 to-transparent blur-3xl dark:from-cyan-500/20 dark:via-blue-600/15" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-gradient-to-tr from-cyan-400/15 via-sky-500/10 to-transparent blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Workspace
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {ctx.tenant.name} ({ctx.tenant.country} · {ctx.tenant.currency})
              </span>
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Good day, {ctx.user.name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Unified workforce, payroll calculations, and asset management control center.
            </p>
          </div>

          {/* Quick Action Buttons with Outline Icons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/app/helpdesk/new"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs backdrop-blur-md transition-all hover:bg-white dark:hover:bg-slate-750 hover:shadow-md active:scale-95"
            >
              <TicketIcon size={14} className="text-slate-500 dark:text-slate-400" />
              <span>Report Ticket</span>
            </Link>
            <Link
              href="/app/assets/requests/new"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-xs backdrop-blur-md transition-all hover:bg-white dark:hover:bg-slate-750 hover:shadow-md active:scale-95"
            >
              <LaptopIcon size={14} className="text-slate-500 dark:text-slate-400" />
              <span>Request Gear</span>
            </Link>
            {ctx.can("employees.read") ? (
              <Link
                href="/app/employees"
                className="inline-flex items-center gap-2 rounded-xl bg-brand text-white px-3.5 py-2 text-xs font-semibold shadow-md shadow-brand/20 transition-all hover:brightness-110 hover:shadow-lg active:scale-95"
              >
                <UsersIcon size={14} />
                <span>People</span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* Primary KPI Stat Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<UsersIcon size={16} className="text-blue-600 dark:text-blue-400" />}
          label="Employees Visible"
          value={total}
          subtitle="Scoped to your role"
          href={ctx.can("employees.read") ? "/app/employees" : undefined}
          accent="blue"
        />
        <StatCard
          icon={<BoltIcon size={16} className="text-amber-600 dark:text-amber-400" />}
          label="Pending Approvals"
          value={data.pending.length}
          subtitle="Requires your action"
          href={ctx.can("approvals.act") ? "/app/approvals" : undefined}
          accent="amber"
          highlight={data.pending.length > 0}
        />
        <StatCard
          icon={<DocumentTextIcon size={16} className="text-indigo-600 dark:text-indigo-400" />}
          label="Pre-Boarding Invites"
          value={data.openInvites}
          subtitle="Awaiting candidate response"
          accent="indigo"
        />
        <StatCard
          icon={<CalendarIcon size={16} className="text-rose-600 dark:text-rose-400" />}
          label="Expiring Visas / Passports"
          value={data.expiring.length}
          subtitle="Next 60 days"
          accent="rose"
          highlight={data.expiring.length > 0}
        />
      </section>

      {/* IT Service Desk KPI Strip (When user has helpdesk role) */}
      {data.desk ? (
        <section className="glass-card rounded-2xl p-5 border border-slate-200/60 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              IT Helpdesk Live Queue
            </h2>
            <Link href="/app/helpdesk" className="text-xs font-semibold text-brand dark:text-cyan-400 hover:underline">
              Open Kanban Board →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Open Tickets" value={data.desk.open} href="/app/helpdesk" icon={<TicketIcon size={16} />} />
            <StatCard label="Assigned to Me" value={data.desk.mine} href="/app/helpdesk?view=mine" icon={<UserIcon size={16} />} />
            <StatCard
              label="Past Resolution SLA"
              value={data.desk.breached}
              href="/app/helpdesk"
              icon={<AlertTriangleIcon size={16} className="text-rose-500" />}
              accent="rose"
              highlight={data.desk.breached > 0}
            />
          </div>
        </section>
      ) : null}

      {/* Main Grid: Data Modules */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Headcount Breakdown */}
        <Card title="Headcount by Employment Status">
          {data.byStatus.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No employee records in this scope.</p>
          ) : (
            <div className="space-y-3">
              {data.byStatus.map((r) => {
                const percent = total > 0 ? Math.round((r.n / total) * 100) : 0;
                return (
                  <div key={r.status} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                        <span className="text-slate-400 text-[11px]">({percent}%)</span>
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">{r.n}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-brand dark:bg-cyan-500 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Expiry Alerts */}
        <Card title="Upcoming Document Expirations (60d)">
          {data.expiring.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-5 text-sm text-slate-500 dark:text-slate-400">
              <CheckCircleIcon size={20} className="text-emerald-500 shrink-0" />
              <span>All employee visas and passports are in good standing.</span>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {data.expiring.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5 text-xs">
                  <Link
                    className="font-medium text-brand dark:text-cyan-400 hover:underline"
                    href={`/app/employees/${e.id}`}
                  >
                    {fullName(e)}
                  </Link>
                  <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300 font-medium">
                    {e.passportExpiry ? `Passport: ${formatDate(e.passportExpiry)}` : null}
                    {e.passportExpiry && e.visaExpiry ? " · " : null}
                    {e.visaExpiry ? `Visa: ${formatDate(e.visaExpiry)}` : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* My Equipment & Tickets */}
        <Card title="My Hardware & Support Tickets">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Issued Equipment</p>
              {data.myAssets.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No hardware custodian assets assigned.</p>
              ) : (
                <ul className="space-y-2">
                  {data.myAssets.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{a.name}</span>
                      <Link
                        className="font-mono rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] text-brand dark:text-cyan-300 hover:underline"
                        href={`/app/assets/${a.id}`}
                      >
                        {a.tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {data.myTickets.length ? (
              <div className="border-t border-slate-100 dark:border-white/5 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Recent Tickets</p>
                <ul className="space-y-1.5">
                  {data.myTickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-xs">
                      <Link
                        className="truncate text-brand dark:text-cyan-400 hover:underline"
                        href={`/app/helpdesk/${t.id}`}
                      >
                        <span className="font-mono text-slate-500 mr-1.5">{t.number}</span>
                        {t.title}
                      </Link>
                      <Badge>{t.status.replace("_", " ")}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex gap-4 border-t border-slate-100 dark:border-white/5 pt-3 text-xs">
              <Link className="font-semibold text-brand dark:text-cyan-400 hover:underline" href="/app/helpdesk/new">
                + Report Ticket
              </Link>
              <Link className="font-semibold text-brand dark:text-cyan-400 hover:underline" href="/app/assets/requests/new">
                + Request Equipment
              </Link>
            </div>
          </div>
        </Card>

        {/* My Record Card */}
        {data.me ? (
          <Card title="My Personal Record">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 p-3">
                <dt className="text-slate-500 dark:text-slate-400">Employee ID</dt>
                <dd className="mt-0.5 font-bold text-slate-900 dark:text-white">{data.me.employeeNo}</dd>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 p-3">
                <dt className="text-slate-500 dark:text-slate-400">Job Title</dt>
                <dd className="mt-0.5 font-bold text-slate-900 dark:text-white truncate">{data.me.jobTitle}</dd>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 p-3">
                <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="mt-0.5">
                  <Badge tone={statusTone[data.me.status]}>{data.me.status}</Badge>
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 p-3">
                <dt className="text-slate-500 dark:text-slate-400">Joined</dt>
                <dd className="mt-0.5 font-bold text-slate-900 dark:text-white">{formatDate(data.me.hireDate)}</dd>
              </div>
            </dl>
            <div className="mt-4 text-right">
              <Link
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand dark:text-cyan-400 hover:underline"
                href={`/app/employees/${data.me.id}`}
              >
                View Full Employee Profile →
              </Link>
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  href,
  accent = "blue",
  highlight = false,
}: {
  icon?: ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  href?: string;
  accent?: "blue" | "amber" | "rose" | "indigo";
  highlight?: boolean;
}) {
  const accentStyles = {
    blue: "group-hover:border-blue-400/50",
    amber: "group-hover:border-amber-400/50",
    rose: "group-hover:border-rose-400/50",
    indigo: "group-hover:border-indigo-400/50",
  };

  const body = (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white/70 dark:bg-slate-900/65 backdrop-blur-xl p-5 shadow-lg shadow-slate-200/30 dark:shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${
        highlight
          ? "border-amber-400/40 dark:border-amber-400/30 ring-1 ring-amber-400/20"
          : "border-white/70 dark:border-white/10"
      } ${accentStyles[accent]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</p>
        {icon ? (
          <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/10">
            {icon}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>

      {subtitle ? <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</p> : null}
    </div>
  );

  return href ? <Link href={href} className="block">{body}</Link> : body;
}
