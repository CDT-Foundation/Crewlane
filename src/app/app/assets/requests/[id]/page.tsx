import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, LinkButton, PageHeader, Table, statusTone } from "@/components/ui";
import { approvalRequests, assetCategories, assetEvents, assetRequestLines, assetRequests, assets, employees, purchaseOrders } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { money } from "@/lib/utils";
import { requestTone } from "../tone";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage();
  const data = await tenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select({ r: assetRequests, first: employees.firstName, last: employees.lastName, managerId: employees.managerId })
      .from(assetRequests)
      .innerJoin(employees, eq(employees.id, assetRequests.forEmployeeId))
      .where(eq(assetRequests.id, id));
    if (!row) return null;
    const mine = row.r.forEmployeeId === ctx.employeeId || row.r.requestedBy === ctx.user.id || row.managerId === ctx.employeeId;
    if (!mine && !ctx.can("assets.read")) return null;
    const lines = await tx
      .select({ l: assetRequestLines, cat: assetCategories.name })
      .from(assetRequestLines)
      .innerJoin(assetCategories, eq(assetCategories.id, assetRequestLines.categoryId))
      .where(eq(assetRequestLines.requestId, id));
    const [approval] = row.r.approvalRequestId ? await tx.select().from(approvalRequests).where(eq(approvalRequests.id, row.r.approvalRequestId)) : [];
    const allocated = await tx
      .selectDistinct({ id: assets.id, tag: assets.tag, name: assets.name, status: assets.status })
      .from(assetEvents)
      .innerJoin(assets, eq(assets.id, assetEvents.assetId))
      .where(and(eq(assetEvents.type, "assigned"), eq(assetEvents.requestId, id)));
    const pos = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.assetRequestId, id));
    return { ...row, lines, approval, allocated, pos };
  });
  if (!data) notFound();
  const { r } = data;
  const cur = ctx.tenant.currency;

  return (
    <>
      <PageHeader
        title={`${r.number} · equipment for ${data.first} ${data.last}`}
        description={<Badge tone={requestTone[r.status]}>{r.status.replace("_", " ")}</Badge>}
        actions={
          ctx.can("procurement.manage") && r.status === "awaiting_stock" ? (
            <LinkButton href={`/app/procurement/new?request=${r.id}`}>Raise purchase order</LinkButton>
          ) : null
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Items">
            <Table>
              <thead><tr><th>Category</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Issued</th><th className="text-right">Est. unit cost</th></tr></thead>
              <tbody>
                {data.lines.map(({ l, cat }) => (
                  <tr key={l.id}>
                    <td>{cat}</td><td>{l.description}</td><td className="text-right">{l.quantity}</td>
                    <td className="text-right">{l.fulfilledQty}</td><td className="text-right tabular-nums">{money(l.estimatedUnitCost, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {r.reason ? <p className="mt-4 text-sm text-slate-600">Reason: {r.reason}</p> : null}
          </Card>
          {data.allocated.length ? (
            <Card title="Allocated from stock">
              <ul className="space-y-1 text-sm">
                {data.allocated.map((a) => (
                  <li key={a.id}><Link className="font-mono text-brand hover:underline" href={`/app/assets/${a.id}`}>{a.tag}</Link> {a.name} <Badge>{a.status.replace("_", " ")}</Badge></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">Open each asset to record the recipient&apos;s handover signature.</p>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          {data.approval ? (
            <Card title="Approval">
              <ol className="space-y-1 text-sm">
                {data.approval.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Badge tone={i < data.approval!.currentStep || data.approval!.status === "approved" ? "green" : i === data.approval!.currentStep && data.approval!.status === "pending" ? "amber" : "gray"}>{i + 1}</Badge>
                    {s.name}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm">Status: <Badge tone={statusTone[data.approval.status]}>{data.approval.status}</Badge></p>
            </Card>
          ) : null}
          {data.pos.length ? (
            <Card title="Purchase orders">
              <ul className="space-y-1 text-sm">
                {data.pos.map((p) => <li key={p.id}><Link className="text-brand hover:underline" href={`/app/procurement/${p.id}`}>{p.number}</Link> <Badge>{p.status.replace("_", " ")}</Badge></li>)}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
