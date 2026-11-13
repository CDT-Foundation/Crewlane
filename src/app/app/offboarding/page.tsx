import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { clearanceItems, clearances, employees } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";

const clearanceTone = { open: "amber", cleared: "green", overridden: "red" } as const;

export default async function OffboardingPage() {
  const ctx = await requirePage("offboarding.manage");
  const rows = await tenantTx(ctx, (tx) =>
    tx
      .select({
        c: clearances, first: employees.firstName, last: employees.lastName, no: employees.employeeNo,
        pending: sql<number>`(select count(*)::int from ${clearanceItems} ci where ci.clearance_id = ${clearances.id} and ci.status = 'pending')`,
        total: sql<number>`(select count(*)::int from ${clearanceItems} ci where ci.clearance_id = ${clearances.id})`,
      })
      .from(clearances)
      .innerJoin(employees, eq(employees.id, clearances.employeeId))
      .orderBy(desc(clearances.createdAt)),
  );
  return (
    <>
      <PageHeader
        title="Exit clearance"
        description="Opened automatically when a resignation or termination is approved. Final settlement and gratuity stay blocked until every item is cleared."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState>No exits in progress.</EmptyState>
        ) : (
          <Table>
            <thead><tr><th>Employee</th><th>Last day</th><th>Items</th><th>Status</th><th>Final settlement</th></tr></thead>
            <tbody>
              {rows.map(({ c, first, last, no, pending, total }) => (
                <tr key={c.id}>
                  <td><Link className="font-medium text-brand hover:underline" href={`/app/offboarding/${c.id}`}>{first} {last}</Link> <span className="font-mono text-xs text-slate-500">{no}</span></td>
                  <td>{c.exitDate}</td>
                  <td>{total - pending} / {total} cleared</td>
                  <td><Badge tone={(clearanceTone as Record<string, "amber" | "green" | "red">)[c.status]}>{c.status}</Badge></td>
                  <td>{c.settlementBlocked ? <Badge tone="red">blocked</Badge> : <Badge tone="green">can be released</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
