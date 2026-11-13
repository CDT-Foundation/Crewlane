import { desc, eq, notInArray } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { employees, telecomBills, telecomLines } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow, money } from "@/lib/utils";
import { addLineAction, decideAction, importBillsAction, reassignLineAction } from "./actions";

const tone = { within_allowance: "green", pending_review: "amber", deduction_raised: "blue", waived: "gray" } as const;

export default async function TelecomPage() {
  const ctx = await requirePage("telecom.manage");
  const data = await tenantTx(ctx, async (tx) => ({
    lines: await tx.select({ l: telecomLines, first: employees.firstName, last: employees.lastName }).from(telecomLines).leftJoin(employees, eq(employees.id, telecomLines.employeeId)).orderBy(telecomLines.number),
    bills: await tx
      .select({ b: telecomBills, number: telecomLines.number, first: employees.firstName, last: employees.lastName })
      .from(telecomBills)
      .innerJoin(telecomLines, eq(telecomLines.id, telecomBills.lineId))
      .leftJoin(employees, eq(employees.id, telecomLines.employeeId))
      .orderBy(desc(telecomBills.period), telecomLines.number)
      .limit(300),
    people: await tx.select({ id: employees.id, first: employees.firstName, last: employees.lastName }).from(employees).where(notInArray(employees.status, ["resigned", "terminated"])).orderBy(employees.firstName),
  }));
  const cur = ctx.tenant.currency;
  const lastMonth = isoDateFromNow(-28).slice(0, 7);

  return (
    <>
      <PageHeader
        title="Corporate mobile lines"
        description="Import the monthly bill. Usage above each role's allowance is held for review, then recovered through payroll or waived."
      />
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-3">
          <Card title={`Lines (${data.lines.length})`} className="xl:col-span-2">
            {data.lines.length === 0 ? (
              <EmptyState>No lines yet.</EmptyState>
            ) : (
              <Table>
                <thead><tr><th>Number</th><th>Carrier</th><th>Allowance</th><th>Assigned to</th></tr></thead>
                <tbody>
                  {data.lines.map(({ l }) => (
                    <tr key={l.id}>
                      <td className="font-mono text-xs">{l.number}</td>
                      <td>{l.carrier}{l.plan ? <span className="text-slate-500"> · {l.plan}</span> : null}</td>
                      <td className="tabular-nums">{money(l.monthlyAllowance, cur)}</td>
                      <td>
                        <ActionForm action={reassignLineAction.bind(null, l.id)} submitLabel="Set" variant="ghost" inline>
                          <Select name="employeeId" defaultValue={l.employeeId ?? ""} className="w-52">
                            <option value="">Unassigned</option>
                            {data.people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}</option>)}
                          </Select>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <div className="space-y-6">
            <Card title="Add a line">
              <ActionForm action={addLineAction} submitLabel="Add line" variant="secondary" resetOnSuccess>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Number"><Input name="number" required placeholder="0771234567" /></Field>
                  <Field label="Carrier"><Input name="carrier" required placeholder="Dialog" /></Field>
                  <Field label="Plan"><Input name="plan" /></Field>
                  <Field label="Monthly allowance"><Input name="monthlyAllowance" inputMode="decimal" required /></Field>
                </div>
                <Field label="Assigned to">
                  <Select name="employeeId">
                    <option value="">Unassigned</option>
                    {data.people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}</option>)}
                  </Select>
                </Field>
              </ActionForm>
            </Card>
            <Card title="Import a bill">
              <ActionForm action={importBillsAction} submitLabel="Import" resetOnSuccess>
                <Field label="Billing month"><Input name="period" type="month" defaultValue={lastMonth} required /></Field>
                <Field label="CSV file" hint="Two columns: number, amount."><Input name="file" type="file" accept=".csv,text/csv" /></Field>
                <Field label="…or paste rows"><Textarea name="csv" rows={3} className="font-mono text-xs" placeholder={"0771234567,4250.50\n0712223334,1800"} /></Field>
              </ActionForm>
            </Card>
          </div>
        </div>
        <Card title="Bills">
          {data.bills.length === 0 ? (
            <EmptyState>No bills imported yet.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>Month</th><th>Number</th><th>User</th><th className="text-right">Bill</th><th className="text-right">Allowance</th><th className="text-right">Personal excess</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.bills.map(({ b, number, first, last }) => (
                  <tr key={b.id}>
                    <td>{b.period}</td>
                    <td className="font-mono text-xs">{number}</td>
                    <td>{first ? `${first} ${last}` : ""}</td>
                    <td className="text-right tabular-nums">{money(b.amount, cur)}</td>
                    <td className="text-right tabular-nums">{money(b.allowance, cur)}</td>
                    <td className="text-right tabular-nums">{Number(b.excess) > 0 ? money(b.excess, cur) : "—"}</td>
                    <td><Badge tone={tone[b.status]}>{b.status.replace(/_/g, " ")}</Badge></td>
                    <td className="space-x-1 whitespace-nowrap">
                      {b.status === "pending_review" ? (
                        <>
                          <ActionForm action={decideAction.bind(null, b.id, "deduct")} submitLabel="Deduct" variant="secondary" inline />
                          <ActionForm action={decideAction.bind(null, b.id, "waive")} submitLabel="Waive" variant="ghost" inline />
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
