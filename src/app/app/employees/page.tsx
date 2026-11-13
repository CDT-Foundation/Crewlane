import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { Badge, Input, LinkButton, PageHeader, Select, statusTone, Table, EmptyState, buttonClass } from "@/components/ui";
import { employees, employeeStatus, jobGrades, orgUnits } from "@/db/schema";
import { employeeScopeFilter, fullName } from "@/lib/employees";
import { requirePage, tenantTx } from "@/lib/session";

type Search = { q?: string; status?: string; unit?: string };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePage("employees.read");
  const { q = "", status = "", unit = "" } = await searchParams;
  const scope = ctx.scope("employees.read")!;

  const { rows, units } = await tenantTx(ctx, async (tx) => {
    const manager = alias(employees, "manager");
    const conds: (SQL | undefined)[] = [employeeScopeFilter(scope, ctx.employeeId)];
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      conds.push(
        or(
          ilike(employees.firstName, like), ilike(employees.lastName, like), ilike(employees.employeeNo, like),
          ilike(employees.workEmail, like), ilike(employees.jobTitle, like),
        ),
      );
    }
    if ((employeeStatus.enumValues as readonly string[]).includes(status)) {
      conds.push(eq(employees.status, status as (typeof employeeStatus.enumValues)[number]));
    }
    if (/^[0-9a-f-]{36}$/.test(unit)) conds.push(eq(employees.orgUnitId, unit));

    const rows = await tx
      .select({
        e: employees, unit: orgUnits.name, grade: jobGrades.code,
        managerFirst: manager.firstName, managerLast: manager.lastName,
      })
      .from(employees)
      .leftJoin(orgUnits, eq(orgUnits.id, employees.orgUnitId))
      .leftJoin(jobGrades, eq(jobGrades.id, employees.jobGradeId))
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(and(...conds))
      .orderBy(asc(employees.employeeNo))
      .limit(500);
    const units = await tx.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).orderBy(asc(orgUnits.name));
    return { rows, units };
  });

  return (
    <>
      <PageHeader
        title="People"
        description={scope === "company" ? "Everyone in the organisation." : `Showing people within your ${scope} scope.`}
        actions={ctx.can("employees.write") ? <LinkButton href="/app/employees/new">Add employee</LinkButton> : null}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, number, email, title" className="max-w-xs" />
        <Select name="status" defaultValue={status} className="w-40">
          <option value="">Any status</option>
          {employeeStatus.enumValues.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select name="unit" defaultValue={unit} className="w-56">
          <option value="">Any unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState>No people match.</EmptyState></div>
        ) : (
          <Table>
            <thead>
              <tr><th>No.</th><th>Name</th><th>Title</th><th>Unit</th><th>Grade</th><th>Manager</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map(({ e, unit, grade, managerFirst, managerLast }) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="font-mono text-xs text-slate-500">{e.employeeNo}</td>
                  <td><Link href={`/app/employees/${e.id}`} className="font-medium text-brand hover:underline">{fullName(e)}</Link></td>
                  <td>{e.jobTitle}</td>
                  <td>{unit}</td>
                  <td>{grade}</td>
                  <td>{managerFirst ? `${managerFirst} ${managerLast}` : ""}</td>
                  <td><Badge tone={statusTone[e.status]}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">{rows.length} shown{rows.length === 500 ? " (first 500)" : ""}</p>
    </>
  );
}
