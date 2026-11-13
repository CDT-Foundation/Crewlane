import { and, eq, or, type SQL, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees } from "@/db/schema";
import type { Scope } from "./permissions";

/** Next employee number (E0001, E0002, ...), serialised per tenant. */
export async function nextEmployeeNo(tx: Tx, tenantId: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"empno:" + tenantId}, 0))`);
  const [row] = await tx
    .select({
      max: sql<number>`coalesce(max(nullif(regexp_replace(${employees.employeeNo}, '\\D', '', 'g'), '')::int), 0)`,
    })
    .from(employees);
  return `E${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

/**
 * Row filter for employee visibility at a given scope. RLS already limits
 * rows to the tenant; this narrows further within it.
 */
export function employeeScopeFilter(scope: Scope, myEmployeeId: string | null): SQL | undefined {
  if (scope === "company") return undefined;
  if (!myEmployeeId) return sql`false`;
  if (scope === "self") return eq(employees.id, myEmployeeId);
  if (scope === "reports") {
    return or(
      eq(employees.id, myEmployeeId),
      eq(employees.managerId, myEmployeeId),
      eq(employees.dottedManagerId, myEmployeeId),
    );
  }
  // department: everyone in my org unit and its descendants.
  return sql`${employees.orgUnitId} in (
    with recursive sub as (
      select ou.id from org_units ou
      where ou.id = (select e.org_unit_id from employees e where e.id = ${myEmployeeId})
      union all
      select c.id from org_units c join sub on c.parent_id = sub.id
    ) select id from sub
  ) or ${employees.id} = ${myEmployeeId}`;
}

export async function canSeeEmployee(tx: Tx, scope: Scope, myEmployeeId: string | null, employeeId: string) {
  const filter = employeeScopeFilter(scope, myEmployeeId);
  const [row] = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(filter ? and(eq(employees.id, employeeId), filter) : eq(employees.id, employeeId))
    .limit(1);
  return Boolean(row);
}

export function fullName(e: { firstName: string; lastName: string }) {
  return `${e.firstName} ${e.lastName}`.trim();
}
