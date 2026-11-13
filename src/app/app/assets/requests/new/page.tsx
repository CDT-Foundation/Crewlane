import { asc, eq, or } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { assetCategories, employees } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { createRequestAction } from "../actions";

export default async function NewRequestPage() {
  const ctx = await requirePage();
  const { cats, people } = await tenantTx(ctx, async (tx) => ({
    cats: await tx.select().from(assetCategories).orderBy(asc(assetCategories.name)),
    people: await tx
      .select({ id: employees.id, first: employees.firstName, last: employees.lastName })
      .from(employees)
      .where(ctx.can("assets.manage") ? undefined : or(eq(employees.id, ctx.employeeId ?? ""), eq(employees.managerId, ctx.employeeId ?? "")))
      .orderBy(employees.firstName),
  }));
  return (
    <>
      <PageHeader title="Request equipment" description="Requests over the workflow threshold need a second approval. Estimates are optional." />
      <Card>
        <ActionForm action={createRequestAction} submitLabel="Submit request">
          <Field label="For">
            <Select name="forEmployeeId" defaultValue={ctx.employeeId ?? ""}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}{p.id === ctx.employeeId ? " (me)" : ""}</option>)}
            </Select>
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Items</p>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_5rem_9rem]">
                <Select name={`cat_${i}`} defaultValue={i === 0 ? cats.find((c) => c.code === "LAP")?.id : ""} aria-label="Category">
                  <option value="">—</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Input name={`desc_${i}`} placeholder="Description, e.g. 14-inch laptop, 16 GB RAM" aria-label="Description" />
                <Input name={`qty_${i}`} type="number" min={0} max={100} defaultValue={i === 0 ? 1 : 0} aria-label="Quantity" />
                <Input name={`cost_${i}`} type="number" min={0} step="0.01" placeholder="Est. unit cost" aria-label="Estimated unit cost" />
              </div>
            ))}
          </div>
          <Field label="Why do you need it?"><Textarea name="reason" rows={2} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
