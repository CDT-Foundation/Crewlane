import { desc, eq, gte, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { delegations, employees } from "@/db/schema";
import { fullName } from "@/lib/employees";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow } from "@/lib/utils";
import { createDelegationAction, deleteDelegationAction } from "./actions";

export default async function DelegationsPage() {
  const ctx = await requirePage();
  const admin = ctx.can("employees.write");
  const today = isoDateFromNow(0);
  const { rows, people } = await tenantTx(ctx, async (tx) => {
    const away = alias(employees, "away");
    const cover = alias(employees, "cover");
    const rows = await tx
      .select({ d: delegations, awayFirst: away.firstName, awayLast: away.lastName, coverFirst: cover.firstName, coverLast: cover.lastName })
      .from(delegations)
      .innerJoin(away, eq(away.id, delegations.employeeId))
      .innerJoin(cover, eq(cover.id, delegations.delegateEmployeeId))
      .where(
        admin
          ? gte(delegations.endsOn, today)
          : or(eq(delegations.employeeId, ctx.employeeId ?? ""), eq(delegations.delegateEmployeeId, ctx.employeeId ?? "")),
      )
      .orderBy(desc(delegations.startsOn));
    const people = await tx
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, no: employees.employeeNo })
      .from(employees)
      .where(notInArray(employees.status, ["resigned", "terminated"]))
      .orderBy(employees.firstName);
    return { rows, people };
  });

  return (
    <>
      <PageHeader
        title="Out of office"
        description="While you are away, approvals addressed to you and IT tickets assigned to you go to the colleague covering for you. Leave in Phase 3 sets this up automatically."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Who is covering" className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState>No cover arrangements.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>Away</th><th>Covered by</th><th>Dates</th><th>Reason</th><th /></tr></thead>
              <tbody>
                {rows.map(({ d, awayFirst, awayLast, coverFirst, coverLast }) => (
                  <tr key={d.id}>
                    <td>{fullName({ firstName: awayFirst, lastName: awayLast })}</td>
                    <td>{fullName({ firstName: coverFirst, lastName: coverLast })}</td>
                    <td className="whitespace-nowrap">
                      {d.startsOn} → {d.endsOn} {d.startsOn <= today && d.endsOn >= today ? <Badge tone="amber">now</Badge> : null}
                    </td>
                    <td>{d.reason}</td>
                    <td>{admin || d.employeeId === ctx.employeeId ? <ActionForm action={deleteDelegationAction.bind(null, d.id)} submitLabel="Remove" variant="ghost" inline /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Set up cover">
          <ActionForm action={createDelegationAction} submitLabel="Save" resetOnSuccess>
            {admin ? (
              <Field label="Person away">
                <Select name="employeeId" defaultValue={ctx.employeeId ?? ""}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.no})</option>)}
                </Select>
              </Field>
            ) : null}
            <Field label="Covered by">
              <Select name="delegateEmployeeId" required>
                <option value="">Choose…</option>
                {people.filter((p) => p.id !== ctx.employeeId).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.no})</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input name="startsOn" type="date" required defaultValue={today} /></Field>
              <Field label="Until"><Input name="endsOn" type="date" required /></Field>
            </div>
            <Field label="Reason"><Input name="reason" placeholder="Annual leave" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
