import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, LinkButton, PageHeader, Table } from "@/components/ui";
import { purchaseOrders, vendors } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, money } from "@/lib/utils";
import { addVendorAction } from "./actions";
import { poTone } from "./tone";

export default async function ProcurementPage() {
  const ctx = await requirePage("procurement.manage");
  const { pos, vendorRows } = await tenantTx(ctx, async (tx) => ({
    pos: await tx.select({ p: purchaseOrders, vendor: vendors.name }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId)).orderBy(desc(purchaseOrders.createdAt)).limit(200),
    vendorRows: await tx.select().from(vendors).orderBy(vendors.name),
  }));
  return (
    <>
      <PageHeader
        title="Procurement"
        description="Out-of-stock requests become purchase orders. Orders go through approval, and receiving goods adds them to the asset register."
        actions={<LinkButton href="/app/procurement/new">New purchase order</LinkButton>}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Purchase orders" className="xl:col-span-2">
          {pos.length === 0 ? (
            <EmptyState>No purchase orders yet.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>No.</th><th>Vendor</th><th className="text-right">Total</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {pos.map(({ p, vendor }) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs"><Link className="text-brand hover:underline" href={`/app/procurement/${p.id}`}>{p.number}</Link></td>
                    <td>{vendor}</td>
                    <td className="text-right tabular-nums">{money(p.total, p.currency)}</td>
                    <td><Badge tone={poTone[p.status]}>{p.status.replace("_", " ")}</Badge></td>
                    <td className="text-xs text-slate-500">{formatDateTime(p.createdAt, ctx.tenant.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title={`Vendors (${vendorRows.length})`}>
          <ul className="mb-4 space-y-1 text-sm">
            {vendorRows.map((v) => <li key={v.id}>{v.name}{v.email ? <span className="text-slate-500"> · {v.email}</span> : null}</li>)}
          </ul>
          <ActionForm action={addVendorAction} submitLabel="Add vendor" variant="secondary" resetOnSuccess>
            <Field label="Name"><Input name="name" required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Email"><Input name="email" type="email" /></Field>
              <Field label="Phone"><Input name="phone" /></Field>
            </div>
            <Field label="Tax / VAT no."><Input name="taxNo" /></Field>
            <Field label="Address"><Input name="address" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
