import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, PageHeader, Table, Textarea } from "@/components/ui";
import { assetCategories, assetRequests, goodsReceipts, poLines, purchaseOrders, user, vendors } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, money } from "@/lib/utils";
import { cancelPoAction, receiveAction, submitPoAction } from "../actions";
import { poTone } from "../tone";

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("procurement.manage");
  const data = await tenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select({ p: purchaseOrders, v: vendors, req: assetRequests.number, by: user.name })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .leftJoin(assetRequests, eq(assetRequests.id, purchaseOrders.assetRequestId))
      .leftJoin(user, eq(user.id, purchaseOrders.createdBy))
      .where(eq(purchaseOrders.id, id));
    if (!row) return null;
    const lines = await tx.select({ l: poLines, cat: assetCategories.name }).from(poLines).innerJoin(assetCategories, eq(assetCategories.id, poLines.categoryId)).where(eq(poLines.poId, id));
    const grns = await tx.select().from(goodsReceipts).where(eq(goodsReceipts.poId, id)).orderBy(desc(goodsReceipts.createdAt));
    return { ...row, lines, grns };
  });
  if (!data) notFound();
  const { p, v } = data;
  const receivable = p.status === "issued" || p.status === "partially_received";

  return (
    <>
      <PageHeader
        title={`${p.number} · ${v.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={poTone[p.status]}>{p.status.replace("_", " ")}</Badge>
            <span>{money(p.total, p.currency)}</span>
            {p.quoteRef ? <span>· quote {p.quoteRef}</span> : null}
            {data.req ? <span>· for <Link className="text-brand hover:underline" href={`/app/assets/requests/${p.assetRequestId}`}>{data.req}</Link></span> : null}
            {data.by ? <span>· raised by {data.by}</span> : null}
          </span>
        }
        actions={
          p.status === "draft" ? (
            <>
              <ActionForm action={cancelPoAction.bind(null, p.id)} submitLabel="Cancel" variant="ghost" inline confirm="Cancel this order?" />
              <ActionForm action={submitPoAction.bind(null, p.id)} submitLabel="Submit for approval" inline />
            </>
          ) : null
        }
      />
      <div className="space-y-6">
        <Card title="Lines">
          <Table>
            <thead><tr><th>Category</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Received</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {data.lines.map(({ l, cat }) => (
                <tr key={l.id}>
                  <td>{cat}</td><td>{l.description}</td><td className="text-right">{l.quantity}</td><td className="text-right">{l.receivedQty}</td>
                  <td className="text-right tabular-nums">{money(l.unitCost, p.currency)}</td>
                  <td className="text-right tabular-nums">{money(Number(l.unitCost) * l.quantity, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {receivable ? (
          <Card title="Receive goods">
            <ActionForm action={receiveAction.bind(null, p.id, data.lines.map((x) => x.l.id))} submitLabel="Record goods received">
              <div className="space-y-3">
                {data.lines.filter(({ l }) => l.receivedQty < l.quantity).map(({ l }) => (
                  <div key={l.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr]">
                    <p className="text-sm">{l.description} <span className="text-slate-500">({l.quantity - l.receivedQty} outstanding)</span></p>
                    <Input name={`recv_${l.id}`} type="number" min={0} max={l.quantity - l.receivedQty} defaultValue={l.quantity - l.receivedQty} aria-label="Quantity received" />
                    <Textarea name={`serials_${l.id}`} rows={1} placeholder="Serial numbers, one per line" aria-label="Serial numbers" className="min-h-10" />
                  </div>
                ))}
              </div>
              <Input name="notes" placeholder="Delivery note number, remarks" />
            </ActionForm>
          </Card>
        ) : null}

        {data.grns.length ? (
          <Card title="Goods received notes">
            <ul className="space-y-1 text-sm">
              {data.grns.map((g) => (
                <li key={g.id}><span className="font-mono">{g.number}</span> · {formatDateTime(g.createdAt, ctx.tenant.timezone)} · {g.lines.reduce((s, l) => s + l.quantity, 0)} item(s){g.notes ? ` · ${g.notes}` : ""}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
