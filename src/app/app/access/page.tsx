import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { employees, membershipRoles, memberships, roles, user } from "@/db/schema";
import { PERMISSIONS, SCOPES } from "@/lib/permissions";
import { requirePage, tenantTx } from "@/lib/session";
import { assignRoleAction, createRoleAction, removeRoleAction, updateRolePermissionsAction } from "./actions";

export default async function AccessPage() {
  const ctx = await requirePage("roles.manage");
  const { roleRows, members } = await tenantTx(ctx, async (tx) => {
    const roleRows = await tx.select().from(roles).orderBy(asc(roles.isSystem), asc(roles.name));
    const rows = await tx
      .select({
        m: memberships, email: user.email, name: user.name,
        employeeId: employees.id, employeeNo: employees.employeeNo,
        grantId: membershipRoles.id, roleName: roles.name, roleKey: roles.key, scope: membershipRoles.scope,
      })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .leftJoin(employees, eq(employees.id, memberships.employeeId))
      .leftJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .leftJoin(roles, eq(roles.id, membershipRoles.roleId))
      .orderBy(asc(user.name));
    const members = new Map<string, { m: (typeof rows)[number]; grants: (typeof rows)[number][] }>();
    for (const r of rows) {
      const entry = members.get(r.m.id) ?? { m: r, grants: [] };
      if (r.grantId) entry.grants.push(r);
      members.set(r.m.id, entry);
    }
    return { roleRows, members: [...members.values()] };
  });

  const perms = Object.entries(PERMISSIONS);

  return (
    <>
      <PageHeader
        title="Roles and access"
        description="A role is a set of permissions. Each assignment has a scope: self, direct reports, department (including sub-units) or the whole company."
      />
      <div className="space-y-6">
        <Card title={`Members (${members.length})`}>
          <Table>
            <thead><tr><th>Member</th><th>Roles</th><th>Add role</th></tr></thead>
            <tbody>
              {members.map(({ m, grants }) => (
                <tr key={m.m.id} className="align-top">
                  <td>
                    <p className="font-medium">
                      {m.employeeId ? <Link className="text-brand hover:underline" href={`/app/employees/${m.employeeId}`}>{m.name}</Link> : m.name}
                    </p>
                    <p className="text-xs text-slate-500">{m.email}{m.employeeNo ? ` · ${m.employeeNo}` : ""}</p>
                  </td>
                  <td>
                    <ul className="space-y-1">
                      {grants.map((g) => (
                        <li key={g.grantId} className="flex items-center gap-2">
                          <Badge tone="blue">{g.roleName}</Badge>
                          <span className="text-xs text-slate-500">{g.scope}</span>
                          <ActionForm action={removeRoleAction.bind(null, g.grantId!)} submitLabel="×" variant="ghost" inline />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ActionForm action={assignRoleAction.bind(null, m.m.id)} submitLabel="Add" variant="secondary" inline>
                      <Select name="roleId" className="w-40" aria-label="Role">
                        {roleRows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                      <Select name="scope" className="w-32" defaultValue="company" aria-label="Scope">
                        {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-slate-500">To give someone a login, open their employee profile and use Portal access.</p>
        </Card>

        <Card title="Roles">
          <div className="space-y-4">
            {roleRows.map((r) => (
              <details key={r.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  {r.isSystem ? <Badge>system</Badge> : <Badge tone="blue">custom</Badge>}
                  <span className="text-slate-500">{r.permissions.length} permissions</span>
                  {r.description ? <span className="text-slate-500">· {r.description}</span> : null}
                </summary>
                <div className="mt-3">
                  <ActionForm action={updateRolePermissionsAction.bind(null, r.id)} submitLabel="Save permissions" variant="secondary">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map(([key, label]) => (
                        <label key={key} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" name="permissions" value={key} defaultChecked={r.permissions.includes(key)} disabled={r.key === "owner"} className="mt-1" />
                          <span><span className="font-mono text-xs">{key}</span><br /><span className="text-slate-500">{label}</span></span>
                        </label>
                      ))}
                    </div>
                  </ActionForm>
                </div>
              </details>
            ))}
          </div>
        </Card>

        <Card title="Create a custom role">
          <ActionForm action={createRoleAction} submitLabel="Create role" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><Input name="name" placeholder="Regional HR business partner" required /></Field>
              <Field label="Description"><Input name="description" /></Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {perms.map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={key} className="mt-1" />
                  <span><span className="font-mono text-xs">{key}</span> <span className="text-slate-500">— {label}</span></span>
                </label>
              ))}
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
