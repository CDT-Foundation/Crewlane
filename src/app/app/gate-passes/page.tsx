import { desc } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table } from "@/components/ui";
import { gatePasses } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, isoDateFromNow } from "@/lib/utils";

const passTone = { approved: "blue", out: "amber", returned: "green", closed: "gray", cancelled: "gray" } as const;

export default async function GatePassesPage() {
  const ctx = await requirePage("gatepass.manage");
  const rows = await tenantTx(ctx, (tx) => tx.select().from(gatePasses).orderBy(desc(gatePasses.createdAt)).limit(200));
  const today = isoDateFromNow(0);
  return (
    <>
      <PageHeader
        title="Gate passes"
        description="Returnable and non-returnable passes for material and assets leaving site. Security scans them at the gate; overdue returns raise alerts."
        actions={<LinkButton href="/app/gate-passes/new">Issue gate pass</LinkButton>}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState>No gate passes yet.</EmptyState>
        ) : (
          <Table>
            <thead><tr><th>No.</th><th>Type</th><th>Item</th><th>Carrier</th><th>Destination</th><th>Due back</th><th>Status</th><th>Out</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs"><Link className="text-brand hover:underline" href={`/app/gate-passes/${p.id}`}>{p.number}</Link></td>
                  <td>{p.type.replace("_", "-")}</td>
                  <td className="max-w-xs truncate">{p.description}</td>
                  <td>{p.carrierName}</td>
                  <td>{p.destination}</td>
                  <td>
                    {p.expectedReturnOn}
                    {p.status === "out" && p.expectedReturnOn && p.expectedReturnOn < today ? <> <Badge tone="red">overdue</Badge></> : null}
                  </td>
                  <td><Badge tone={(passTone as Record<string, "blue" | "amber" | "green" | "gray">)[p.status]}>{p.status}</Badge></td>
                  <td className="text-xs text-slate-500">{p.outAt ? formatDateTime(p.outAt, ctx.tenant.timezone) : ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
