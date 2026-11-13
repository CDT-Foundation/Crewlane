import { asc, notInArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, jobGrades, orgUnits } from "@/db/schema";

/** Select options for employee forms. Org units are indented by depth. */
export async function employeeFormOptions(tx: Tx) {
  const unitRows = await tx
    .select({ id: orgUnits.id, name: orgUnits.name, parentId: orgUnits.parentId, type: orgUnits.type })
    .from(orgUnits)
    .orderBy(asc(orgUnits.name));
  const units: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const u of unitRows.filter((r) => r.parentId === parent)) {
      units.push({ id: u.id, label: `${"  ".repeat(depth)}${u.name}` });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);

  const grades = (await tx.select().from(jobGrades).orderBy(asc(jobGrades.level))).map((g) => ({
    id: g.id,
    label: `${g.code} · ${g.name}`,
  }));
  const people = (
    await tx
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, no: employees.employeeNo })
      .from(employees)
      .where(notInArray(employees.status, ["resigned", "terminated"]))
      .orderBy(asc(employees.firstName))
  ).map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName} (${p.no})` }));
  return { units, grades, people };
}
