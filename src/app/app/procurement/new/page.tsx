import { asc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { assetCategories, assetRequestLines, assetRequests, vendors } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { createPoAction } from "../actions";

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const ctx = await requirePage("procurement.manage");
  const { request } = await searchParams;
  const data = await tenantTx(ctx, async (tx) => {
    const cats = await tx.select().from(assetCategories).orderBy(asc(assetCategories.name));
    const vendorRows = await tx.select().from(vendors).orderBy(vendors.name);
    let req: typeof assetRequests.$inferSelect | undefined;
    let lines: (typeof assetRequestLines.$inferSelect)[] = [];
    if (request && /^[0-9a-f-]{36}$/.test(request)) {
      [req] = await tx.select().from(assetRequests).where(eq(assetRequests.id, request));
      if (req) lines = await tx.select().from(assetRequestLines).where(eq(assetRequestLines.requestId, req.id));
    }
    return { cats, vendorRows, req, lines: lines.filter((l) => l.quantity > l.fulfilledQty) };
  });
  return (
    <>
      <PageHeader title="New purchase order" description={data.req ? `Prefilled with what ${data.req.number} still needs.` : "Enter the vendor's quotation."} />
      <Card>
        {data.vendorRows.length === 0 ? (
          <p className="text-sm text-slate-600">Add a vendor on the Procurement page first.</p>
        ) : (
          <ActionForm action={createPoAction} submitLabel="Create draft">
            {data.req ? <input type="hidden" name="assetRequestId" value={data.req.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vendor">
                <Select name="vendorId" required>
                  {data.vendorRows.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Quotation reference"><Input name="quoteRef" placeholder="QT-2026-118" /></Field>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Lines ({ctx.tenant.currency})</p>
              {[0, 1, 2, 3, 4].map((i) => {
                const l = data.lines[i];
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_5rem_9rem]">
                    <Select name={`cat_${i}`} defaultValue={l?.categoryId ?? ""} aria-label="Category">
                      <option value="">—</option>
                      {data.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <Input name={`desc_${i}`} defaultValue={l?.description ?? ""} placeholder="Item as quoted" aria-label="Description" />
                    <Input name={`qty_${i}`} type="number" min={0} defaultValue={l ? l.quantity - l.fulfilledQty : 0} aria-label="Quantity" />
                    <Input name={`cost_${i}`} type="number" min={0} step="0.01" defaultValue={l?.estimatedUnitCost ?? ""} placeholder="Unit price" aria-label="Unit price" />
                  </div>
                );
              })}
            </div>
            <Field label="Notes"><Input name="notes" /></Field>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
