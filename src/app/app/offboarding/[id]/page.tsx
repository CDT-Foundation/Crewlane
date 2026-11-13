import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, PageHeader, Textarea } from "@/components/ui";
import { clearanceItems, clearances, employees, payrollDeductions } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, money } from "@/lib/utils";
import { overrideAction, resolveItemAction } from "../actions";

const itemTone = { pending: "amber", done: "green", waived: "gray", lost: "red" } as const;

export default async function ClearancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("offboarding.manage");
  const data = await tenantTx(ctx, async (tx) => {
    const [row] = await tx.select({ c: clearances, e: employees }).from(clearances).innerJoin(employees, eq(employees.id, clearances.employeeId)).where(eq(clearances.id, id));
    if (!row) return null;
    const items = await tx.select({ i: clearanceItems, amount: payrollDeductions.amount, cur: payrollDeductions.currency }).from(clearanceItems).leftJoin(payrollDeductions, eq(payrollDeductions.id, clearanceItems.deductionId)).where(eq(clearanceItems.clearanceId, id));
    const deductions = await tx.select().from(payrollDeductions).where(eq(payrollDeductions.employeeId, row.e.id));
    return { ...row, items, deductions };
  });
  if (!data) notFound();
  const { c, e } = data;
  const tz = ctx.tenant.timezone;

  return (
    <>
      <PageHeader
        title={`Exit clearance · ${e.firstName} ${e.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={c.status === "open" ? "amber" : c.status === "cleared" ? "green" : "red"}>{c.status}</Badge>
            <span>Last day {c.exitDate}</span>
            {c.settlementBlocked ? <Badge tone="red">final settlement blocked</Badge> : <Badge tone="green">final settlement can be released</Badge>}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Checklist" className="xl:col-span-2">
          <ul className="divide-y divide-slate-100">
            {data.items.map(({ i, amount, cur }) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Badge tone={itemTone[i.status]}>{i.status}</Badge>
                <span className="flex-1">
                  {i.type === "asset_return" && i.refId ? <Link className="text-brand hover:underline" href={`/app/assets/${i.refId}`}>{i.description}</Link> : i.description}
                  {amount ? <span className="text-slate-500"> · deduction {money(amount, cur ?? "")}</span> : null}
                  {i.resolvedAt ? <span className="block text-xs text-slate-500">{formatDateTime(i.resolvedAt, tz)}</span> : null}
                </span>
                {i.status === "pending" && c.status === "open" ? (
                  <span className="flex gap-1">
                    {i.type === "asset_return" ? (
                      <Link className="text-xs text-brand underline" href={`/app/assets/${i.refId}`}>Record return or loss</Link>
                    ) : (
                      <ActionForm action={resolveItemAction.bind(null, c.id, i.id, "done")} submitLabel={i.type === "account_revoke" ? "Suspend now" : i.type === "licence_reclaim" ? "Reclaim now" : "Mark done"} variant="secondary" inline />
                    )}
                    <ActionForm action={resolveItemAction.bind(null, c.id, i.id, "waived")} submitLabel="Waive" variant="ghost" inline confirm="Waive this item?" />
                  </span>
                ) : null}
              </li>
            ))}
            {data.items.length === 0 ? <li className="py-3 text-sm text-slate-500">Nothing to clear.</li> : null}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Accounts are suspended and licence seats reclaimed automatically on the last day.</p>
        </Card>
        <div className="space-y-6">
          <Card title="Payroll deductions">
            {data.deductions.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
              <ul className="space-y-1 text-sm">
                {data.deductions.map((d) => <li key={d.id} className="flex justify-between gap-2"><span>{d.description}</span><span className="tabular-nums">{money(d.amount, d.currency)} <Badge>{d.status}</Badge></span></li>)}
              </ul>
            )}
          </Card>
          {c.status === "open" && ctx.hasRole("owner") ? (
            <Card title="Override">
              <ActionForm action={overrideAction.bind(null, c.id)} submitLabel="Release settlement anyway" variant="danger" confirm="Release final settlement with items still open?">
                <Textarea name="reason" rows={2} placeholder="Reason (recorded on the audit trail)" required />
              </ActionForm>
            </Card>
          ) : null}
          {c.overrideReason ? <Card title="Override reason"><p className="text-sm">{c.overrideReason}</p></Card> : null}
        </div>
      </div>
    </>
  );
}
