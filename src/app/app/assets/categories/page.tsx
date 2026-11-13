import { asc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { assetCategories, equipmentKits, jobGrades } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { saveCategoryAction, saveKitAction } from "../actions";

export default async function CategoriesPage() {
  const ctx = await requirePage("assets.manage");
  const { cats, grades, kits } = await tenantTx(ctx, async (tx) => ({
    cats: await tx.select().from(assetCategories).orderBy(asc(assetCategories.name)),
    grades: await tx.select().from(jobGrades).orderBy(asc(jobGrades.level)),
    kits: await tx.select({ k: equipmentKits, grade: jobGrades.name }).from(equipmentKits).leftJoin(jobGrades, eq(jobGrades.id, equipmentKits.jobGradeId)),
  }));
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Categories and equipment kits" description="Depreciation rules per category, and the Day-1 kit issued automatically to new hires by job grade." />
      <div className="space-y-6">
        <Card title="Asset categories">
          <div className="space-y-4">
            {cats.map((c) => (
              <details key={c.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm"><span className="font-mono text-xs">{c.code}</span> {c.name} <span className="text-slate-500">· {c.method === "straight_line" ? `straight line ${c.usefulLifeMonths} months` : `WDV ${c.wdvRate}%`}</span></summary>
                <div className="mt-3"><CategoryForm c={c} /></div>
              </details>
            ))}
            <div className="border-t border-slate-100 pt-4"><CategoryForm /></div>
          </div>
        </Card>

        <Card title="Equipment kits by job grade">
          <ul className="mb-4 space-y-1 text-sm">
            {kits.map(({ k, grade }) => (
              <li key={k.id}><span className="font-medium">{grade ?? "Default (any grade)"}</span>: {k.name} · {k.items.map((i) => `${i.quantity} × ${catName.get(i.categoryId) ?? "?"}`).join(", ") || "nothing"}</li>
            ))}
            {kits.length === 0 ? <li className="text-slate-500">No kits yet. New hires get an onboarding ticket but no automatic equipment.</li> : null}
          </ul>
          <ActionForm action={saveKitAction} submitLabel="Save kit" variant="secondary">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job grade">
                <Select name="jobGradeId" defaultValue="">
                  <option value="">Default (any grade without its own kit)</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </Select>
              </Field>
              <Field label="Kit name"><Input name="name" placeholder="Executive kit" /></Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {cats.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Input name={`qty_${c.id}`} type="number" min={0} max={10} defaultValue={0} className="w-16" />
                  {c.name}
                </label>
              ))}
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

function CategoryForm({ c }: { c?: typeof assetCategories.$inferSelect }) {
  return (
    <ActionForm action={saveCategoryAction.bind(null, c?.id ?? null)} submitLabel={c ? "Save" : "Add category"} variant="secondary" resetOnSuccess={!c}>
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Code"><Input name="code" defaultValue={c?.code} required maxLength={8} /></Field>
        <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={c?.name} required /></Field>
        <Field label="Method">
          <Select name="method" defaultValue={c?.method ?? "straight_line"}>
            <option value="straight_line">Straight line</option>
            <option value="written_down_value">Written-down value</option>
          </Select>
        </Field>
        <Field label="Life (months)"><Input name="usefulLifeMonths" type="number" min={1} defaultValue={c?.usefulLifeMonths ?? 36} /></Field>
        <Field label="WDV rate %"><Input name="wdvRate" type="number" step="0.01" min={0} max={100} defaultValue={c?.wdvRate ?? "25"} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="itManaged" defaultChecked={c?.itManaged ?? true} /> Managed by IT</label>
    </ActionForm>
  );
}
