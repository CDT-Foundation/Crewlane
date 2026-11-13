import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select, statusTone, Textarea } from "@/components/ui";
import {
  approvalRequests, assets, auditLog, clearances, employees, identityAccounts, jobGrades, letterTemplates, letters,
  membershipRoles, memberships, orgUnits, preboardingInvites, roles,
} from "@/db/schema";
import { maskTail } from "@/lib/crypto";
import { canSeeEmployee, fullName } from "@/lib/employees";
import { formatDate } from "@/lib/letters";
import { SCOPES } from "@/lib/permissions";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, humanize, isPast } from "@/lib/utils";
import {
  createPreboardingInviteAction, grantAccessAction, issueLetterAction, requestBankChangeAction, requestExitAction,
  revokeAccessAction, updateEmployeeAction,
} from "../actions";
import { EmployeeFields } from "../employee-fields";
import { employeeFormOptions } from "../options";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("employees.read");
  const readScope = ctx.scope("employees.read")!;
  const writeScope = ctx.scope("employees.write");
  const isSelf = ctx.employeeId === id;

  const data = await tenantTx(ctx, async (tx) => {
    if (!(await canSeeEmployee(tx, readScope, ctx.employeeId, id))) return null;
    const canWrite = writeScope ? await canSeeEmployee(tx, writeScope, ctx.employeeId, id) : false;
    const manager = alias(employees, "manager");
    const [row] = await tx
      .select({ e: employees, unit: orgUnits.name, grade: jobGrades.name, mFirst: manager.firstName, mLast: manager.lastName })
      .from(employees)
      .leftJoin(orgUnits, eq(orgUnits.id, employees.orgUnitId))
      .leftJoin(jobGrades, eq(jobGrades.id, employees.jobGradeId))
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(eq(employees.id, id));
    const reports = await tx
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, jobTitle: employees.jobTitle })
      .from(employees)
      .where(or(eq(employees.managerId, id), eq(employees.dottedManagerId, id)));
    const opts = canWrite ? await employeeFormOptions(tx) : null;
    const pending = await tx
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.subjectId, id), eq(approvalRequests.status, "pending")));
    const issued = await tx
      .select({ id: letters.id, title: letters.title, issuedAt: letters.issuedAt })
      .from(letters)
      .where(eq(letters.employeeId, id))
      .orderBy(desc(letters.issuedAt));
    const templates = ctx.can("letters.issue")
      ? await tx.select({ id: letterTemplates.id, name: letterTemplates.name }).from(letterTemplates)
      : [];
    const invites = ctx.can("preboarding.manage")
      ? await tx.select().from(preboardingInvites).where(eq(preboardingInvites.employeeId, id)).orderBy(desc(preboardingInvites.createdAt))
      : [];
    const access = ctx.can("roles.manage")
      ? await tx
          .select({ membershipId: memberships.id, roleName: roles.name, scope: membershipRoles.scope })
          .from(memberships)
          .leftJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
          .leftJoin(roles, eq(roles.id, membershipRoles.roleId))
          .where(eq(memberships.employeeId, id))
      : [];
    const roleOptions = ctx.can("roles.manage") ? await tx.select({ key: roles.key, name: roles.name }).from(roles) : [];
    const history = ctx.can("audit.read")
      ? await tx
          .select()
          .from(auditLog)
          .where(and(eq(auditLog.entityType, "employee"), eq(auditLog.entityId, id)))
          .orderBy(desc(auditLog.seq))
          .limit(15)
      : [];
    const held = await tx.select({ id: assets.id, tag: assets.tag, name: assets.name }).from(assets).where(and(eq(assets.custodianEmployeeId, id), eq(assets.status, "assigned")));
    const accounts = ctx.can("identity.manage") || isSelf ? await tx.select().from(identityAccounts).where(eq(identityAccounts.employeeId, id)) : [];
    const [clearance] = ctx.can("offboarding.manage") ? await tx.select().from(clearances).where(eq(clearances.employeeId, id)) : [];
    return { row, reports, opts, canWrite, pending, issued, templates, invites, access, roleOptions, history, held, accounts, clearance };
  });
  if (!data?.row) notFound();

  const { e } = data.row;
  const sensitive = ctx.can("employees.sensitive");
  const left = e.status === "resigned" || e.status === "terminated";
  const tz = ctx.tenant.timezone;

  return (
    <>
      <PageHeader
        title={fullName(e)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{e.employeeNo}</span>
            <Badge tone={statusTone[e.status]}>{e.status}</Badge>
            {e.jobTitle ? <span>· {e.jobTitle}</span> : null}
            {data.row.unit ? <span>· {data.row.unit}</span> : null}
            {data.row.grade ? <span>· {data.row.grade}</span> : null}
          </span>
        }
      />

      {data.pending.length > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {data.pending.map((p) => (
            <p key={p.id}>
              Pending approval: {p.title} (step {p.currentStep + 1} of {p.steps.length})
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {data.canWrite && data.opts ? (
            <Card title="Details">
              <ActionForm action={updateEmployeeAction.bind(null, id)} submitLabel="Save changes">
                <EmployeeFields e={e} {...data.opts} showSensitive={sensitive} />
              </ActionForm>
            </Card>
          ) : (
            <Card title="Details">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Item label="Work email" value={e.workEmail} />
                <Item label="Phone" value={e.phone} />
                <Item label="Reports to" value={data.row.mFirst ? `${data.row.mFirst} ${data.row.mLast}` : null} />
                <Item label="Employment type" value={e.employmentType} />
                <Item label="Date of joining" value={formatDate(e.hireDate, tz)} />
                {isSelf || sensitive ? (
                  <>
                    <Item label="National ID" value={sensitive ? e.nationalId : maskTail(e.nationalId)} />
                    <Item label="Passport expiry" value={formatDate(e.passportExpiry, tz)} />
                  </>
                ) : null}
              </dl>
            </Card>
          )}

          <Card title="Salary bank account">
            <p className="text-sm text-slate-700">
              {e.bankName ? (
                <>
                  {e.bankName} · <span className="font-mono">{sensitive ? e.bankAccount : maskTail(e.bankAccount)}</span>
                </>
              ) : (
                <span className="text-slate-500">Not provided.</span>
              )}
            </p>
            {(isSelf || data.canWrite) && !left ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-3 text-xs text-slate-500">
                  Changes to the salary account are high-risk. They take effect only after a different officer approves them (maker-checker).
                </p>
                <ActionForm action={requestBankChangeAction.bind(null, id)} submitLabel="Request change" variant="secondary" resetOnSuccess>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Bank and branch"><Input name="bankName" required placeholder="Commercial Bank, Kandy" /></Field>
                    <Field label="Account number"><Input name="bankAccount" required inputMode="numeric" /></Field>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </Card>

          {data.canWrite && !left ? (
            <Card title="Resignation or termination">
              <ActionForm
                action={requestExitAction.bind(null, id)}
                submitLabel="Send for approval"
                variant="danger"
                confirm="Send this exit for approval?"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Type">
                    <Select name="status" defaultValue="resigned">
                      <option value="resigned">Resignation</option>
                      <option value="terminated">Termination</option>
                    </Select>
                  </Field>
                  <Field label="Last working day"><Input name="exitDate" type="date" required /></Field>
                </div>
                <Field label="Reason"><Textarea name="reason" rows={2} /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {data.history.length > 0 ? (
            <Card title="Recent changes">
              <ul className="space-y-2 text-sm">
                {data.history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-4">
                    <span>{humanize(h.action)}</span>
                    <span className="text-slate-500">{formatDateTime(h.createdAt, tz)}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/app/audit?entity=${id}`} className="mt-3 inline-block text-sm text-brand hover:underline">Full audit trail</Link>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Reporting line">
            <p className="text-sm">
              <span className="text-slate-500">Reports to: </span>
              {data.row.mFirst ? `${data.row.mFirst} ${data.row.mLast}` : "—"}
            </p>
            <p className="mt-3 text-sm text-slate-500">Direct and dotted-line reports</p>
            {data.reports.length ? (
              <ul className="mt-1 space-y-1 text-sm">
                {data.reports.map((r) => (
                  <li key={r.id}>
                    <Link className="text-brand hover:underline" href={`/app/employees/${r.id}`}>{fullName(r)}</Link>
                    {r.jobTitle ? <span className="text-slate-500"> · {r.jobTitle}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">—</p>
            )}
          </Card>

          {data.clearance ? (
            <Card title="Exit clearance">
              <p className="text-sm">
                <Badge tone={data.clearance.status === "open" ? "amber" : "green"}>{data.clearance.status}</Badge>{" "}
                {data.clearance.settlementBlocked ? "Final settlement is blocked." : "Final settlement can be released."}
              </p>
              <Link className="mt-2 inline-block text-sm text-brand hover:underline" href={`/app/offboarding/${data.clearance.id}`}>Open checklist</Link>
            </Card>
          ) : null}

          {data.held.length || ctx.can("assets.read") || isSelf ? (
            <Card title="Equipment held">
              {data.held.length === 0 ? (
                <p className="text-sm text-slate-500">None.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.held.map((a) => (
                    <li key={a.id}><Link className="font-mono text-brand hover:underline" href={`/app/assets/${a.id}`}>{a.tag}</Link> {a.name}</li>
                  ))}
                </ul>
              )}
              {isSelf ? <Link className="mt-3 inline-block text-sm text-brand hover:underline" href="/app/assets/requests/new">Request equipment</Link> : null}
            </Card>
          ) : null}

          {data.accounts.length ? (
            <Card title="Work accounts">
              <ul className="space-y-1 text-sm">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{a.email}</span>
                    <Badge tone={a.status === "active" ? "green" : a.status === "error" ? "red" : "gray"}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {ctx.can("preboarding.manage") && e.status === "preboarding" ? (
            <Card title="Pre-boarding">
              <p className="mb-3 text-sm text-slate-600">
                Send the new hire a secure link to fill in their personal, ID and bank details before day one.
              </p>
              <ActionForm action={createPreboardingInviteAction.bind(null, id)} submitLabel="Create link" variant="secondary" />
              {data.invites.length ? (
                <ul className="mt-4 space-y-1 text-xs text-slate-600">
                  {data.invites.map((i) => (
                    <li key={i.id}>
                      Sent {formatDateTime(i.createdAt, tz)} ·{" "}
                      {i.submittedAt ? (
                        <Badge tone="green">submitted {formatDateTime(i.submittedAt, tz)}</Badge>
                      ) : isPast(i.expiresAt) ? (
                        <Badge>expired</Badge>
                      ) : (
                        <Badge tone="amber">waiting</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          {ctx.can("letters.issue") || data.issued.length ? (
            <Card title="Letters">
              {ctx.can("letters.issue") && data.templates.length ? (
                <ActionForm action={issueLetterAction.bind(null, id)} submitLabel="Issue" variant="secondary" inline>
                  <Select name="templateId" required className="min-w-0 flex-1">
                    {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </ActionForm>
              ) : null}
              <ul className="mt-4 space-y-1 text-sm">
                {data.issued.map((l) => (
                  <li key={l.id}>
                    <Link className="text-brand hover:underline" href={`/app/letters/issued/${l.id}`}>{l.title}</Link>
                    <span className="text-slate-500"> · {formatDate(l.issuedAt, tz)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {ctx.can("roles.manage") ? (
            <Card title="Portal access">
              {data.access.length ? (
                <>
                  <ul className="space-y-1 text-sm">
                    {data.access.map((a, i) => (
                      <li key={i}>{a.roleName ?? "No role"} {a.scope ? <span className="text-slate-500">({a.scope})</span> : null}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center gap-3">
                    <Link href="/app/access" className="text-sm text-brand hover:underline">Change roles</Link>
                    <ActionForm action={revokeAccessAction.bind(null, id)} submitLabel="Revoke" variant="ghost" inline confirm="Revoke portal access?" />
                  </div>
                </>
              ) : left ? (
                <p className="text-sm text-slate-500">No access.</p>
              ) : (
                <ActionForm action={grantAccessAction.bind(null, id)} submitLabel="Grant access" variant="secondary">
                  <Field label="Sign-in email"><Input name="email" type="email" defaultValue={e.workEmail ?? ""} required /></Field>
                  <Field label="Temporary password" hint="Not needed if they already have a Crewlane login.">
                    <Input name="password" type="text" minLength={0} autoComplete="off" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Role">
                      <Select name="roleKey" defaultValue="employee">
                        {data.roleOptions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Scope">
                      <Select name="scope" defaultValue="self">
                        {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                  </div>
                </ActionForm>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5">{value || "—"}</dd>
    </div>
  );
}
