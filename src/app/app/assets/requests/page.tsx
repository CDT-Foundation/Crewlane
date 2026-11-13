import { desc, eq, or } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table } from "@/components/ui";
import { assetRequests, employees } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, money } from "@/lib/utils";
import { requestTone } from "./tone";


export default async function RequestsPage() {
  const ctx = await requirePage();
  const all = ctx.can("assets.read");
  const rows = await tenantTx(ctx, (tx) =>
    tx
      .select({ r: assetRequests, first: employees.firstName, last: employees.lastName })
      .from(assetRequests)
      .innerJoin(employees, eq(employees.id, assetRequests.forEmployeeId))
      .where(all ? undefined : or(eq(assetRequests.forEmployeeId, ctx.employeeId ?? ""), eq(assetRequests.requestedBy, ctx.user.id)))
      .orderBy(desc(assetRequests.createdAt))
      .limit(200),
  );
  return (
    <>
      <PageHeader
        title="Equipment requests"
        description="Ask for a laptop, phone or other equipment. Your line manager approves it; IT issues it from stock or buys it."
        actions={<LinkButton href="/app/assets/requests/new">New request</LinkButton>}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState>No requests yet.</EmptyState>
        ) : (
          <Table>
            <thead><tr><th>No.</th><th>For</th><th>Reason</th><th>Source</th><th>Estimate</th><th>Status</th><th>Raised</th></tr></thead>
            <tbody>
              {rows.map(({ r, first, last }) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs"><Link className="text-brand hover:underline" href={`/app/assets/requests/${r.id}`}>{r.number}</Link></td>
                  <td>{first} {last}</td>
                  <td className="max-w-xs truncate">{r.reason}</td>
                  <td>{r.source.replace("_", " ")}</td>
                  <td className="tabular-nums">{money(r.estimatedTotal, ctx.tenant.currency)}</td>
                  <td><Badge tone={requestTone[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                  <td className="text-xs text-slate-500">{formatDateTime(r.createdAt, ctx.tenant.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
