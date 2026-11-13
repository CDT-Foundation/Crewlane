import { desc, eq } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { employees, payrollDeductions } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, money } from "@/lib/utils";

export default async function DeductionsPage() {
  const ctx = await requirePage("offboarding.manage");
  const rows = await tenantTx(ctx, (tx) =>
    tx.select({ d: payrollDeductions, first: employees.firstName, last: employees.lastName }).from(payrollDeductions).innerJoin(employees, eq(employees.id, payrollDeductions.employeeId)).orderBy(desc(payrollDeductions.createdAt)).limit(300),
  );
  return (
    <>
      <PageHeader title="Payroll deductions" description="Lost assets and personal phone usage. Payroll (Phase 3) applies pending deductions to the next run." />
      <Card>
        {rows.length === 0 ? <EmptyState>No deductions.</EmptyState> : (
          <Table>
            <thead><tr><th>Employee</th><th>Reason</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th>Raised</th></tr></thead>
            <tbody>
              {rows.map(({ d, first, last }) => (
                <tr key={d.id}>
                  <td>{first} {last}</td><td>{d.description}</td><td className="font-mono text-xs">{d.reference}</td>
                  <td className="text-right tabular-nums">{money(d.amount, d.currency)}</td>
                  <td><Badge tone={d.status === "pending" ? "amber" : d.status === "applied" ? "green" : "gray"}>{d.status}</Badge></td>
                  <td className="text-xs text-slate-500">{formatDateTime(d.createdAt, ctx.tenant.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
