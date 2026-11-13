import { asc, count, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { employees, jobGrades, orgUnits, orgUnitType } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { humanize } from "@/lib/utils";
import {
  addGradeAction, addUnitAction, deleteGradeAction, deleteUnitAction, renameUnitAction,
} from "./actions";

type Unit = typeof orgUnits.$inferSelect & { headcount: number };

export default async function OrgPage() {
  const ctx = await requirePage("org.manage");
  const { units, grades } = await tenantTx(ctx, async (tx) => {
    const counts = await tx
      .select({ unit: employees.orgUnitId, n: count() })
      .from(employees)
      .groupBy(employees.orgUnitId);
    const byUnit = new Map(counts.map((c) => [c.unit, c.n]));
    const units = (await tx.select().from(orgUnits).orderBy(asc(orgUnits.name))).map((u) => ({
      ...u,
      headcount: byUnit.get(u.id) ?? 0,
    }));
    const grades = await tx
      .select({ g: jobGrades, n: count(employees.id) })
      .from(jobGrades)
      .leftJoin(employees, eq(employees.jobGradeId, jobGrades.id))
      .groupBy(jobGrades.id)
      .orderBy(asc(jobGrades.level));
    return { units, grades };
  });

  const children = (parent: string | null) => units.filter((u) => u.parentId === parent);

  function Branch({ unit, depth }: { unit: Unit; depth: number }) {
    return (
      <li>
        <div className="group flex flex-wrap items-center gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
          <span className="text-slate-300">{depth ? "└" : "■"}</span>
          <span className="font-medium">{unit.name}</span>
          {unit.code ? <span className="font-mono text-xs text-slate-500">{unit.code}</span> : null}
          <Badge>{humanize(unit.type)}</Badge>
          <span className="text-xs text-slate-500">{unit.headcount} people</span>
          <details className="ml-auto">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">Edit</summary>
            <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <ActionForm action={renameUnitAction.bind(null, unit.id)} submitLabel="Rename" variant="secondary" inline>
                <Input name="name" defaultValue={unit.name} className="w-48" />
              </ActionForm>
              <ActionForm action={deleteUnitAction.bind(null, unit.id)} submitLabel="Delete" variant="ghost" inline confirm={`Delete ${unit.name}?`} />
            </div>
          </details>
        </div>
        <ul>
          {children(unit.id).map((c) => <Branch key={c.id} unit={c} depth={depth + 1} />)}
        </ul>
      </li>
    );
  }

  return (
    <>
      <PageHeader
        title="Structure and grades"
        description="Legal entities, business units, branches, factories, departments, cost centres and locations. Add as many levels as you need — no code changes."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Organisation tree" className="xl:col-span-2">
          <ul className="text-sm">
            {children(null).map((u) => <Branch key={u.id} unit={u} depth={0} />)}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card title="Add a unit">
            <ActionForm action={addUnitAction} submitLabel="Add unit" resetOnSuccess>
              <Field label="Name"><Input name="name" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <Select name="type" defaultValue="department">
                    {orgUnitType.enumValues.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                  </Select>
                </Field>
                <Field label="Code"><Input name="code" placeholder="FIN" /></Field>
              </div>
              <Field label="Sits under">
                <Select name="parentId" defaultValue={units[0]?.id ?? ""}>
                  <option value="">(top level — legal entities only)</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            </ActionForm>
          </Card>
          <Card title="Job grades">
            <ul className="mb-4 space-y-1 text-sm">
              {grades.map(({ g, n }) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span><span className="font-mono text-xs">{g.code}</span> {g.name} <span className="text-slate-500">· level {g.level} · {n} people</span></span>
                  {n === 0 ? (
                    <ActionForm action={deleteGradeAction.bind(null, g.id)} submitLabel="Remove" variant="ghost" inline />
                  ) : null}
                </li>
              ))}
            </ul>
            <ActionForm action={addGradeAction} submitLabel="Add grade" variant="secondary" resetOnSuccess>
              <div className="grid grid-cols-[5rem_1fr_4rem] gap-2">
                <Input name="code" placeholder="G7" required aria-label="Code" />
                <Input name="name" placeholder="Vice president" required aria-label="Name" />
                <Input name="level" type="number" min={1} defaultValue={7} aria-label="Level" />
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
