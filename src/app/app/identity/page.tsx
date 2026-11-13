import { desc, eq, notInArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { employees, identityAccounts, tenantIntegrations } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { createAccountAction, resetPasswordAction, retryProvisionAction, suspendAction } from "./actions";

const tone = { pending: "amber", active: "green", suspended: "gray", deleted: "gray", error: "red" } as const;

export default async function IdentityPage() {
  const ctx = await requirePage("identity.manage");
  const data = await tenantTx(ctx, async (tx) => ({
    rows: await tx
      .select({ a: identityAccounts, first: employees.firstName, last: employees.lastName, status: employees.status })
      .from(identityAccounts)
      .innerJoin(employees, eq(employees.id, identityAccounts.employeeId))
      .orderBy(desc(identityAccounts.updatedAt)),
    integrations: await tx.select().from(tenantIntegrations),
    people: await tx.select({ id: employees.id, first: employees.firstName, last: employees.lastName }).from(employees).where(notInArray(employees.status, ["resigned", "terminated"])).orderBy(employees.firstName),
  }));
  const enabled = data.integrations.filter((i) => i.enabled && (i.provider === "google_workspace" || i.provider === "microsoft_365"));

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Google Workspace and Microsoft 365 accounts. New hires get accounts automatically; leavers are suspended on their last day."
      />
      {enabled.length === 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No identity provider is enabled. <Link className="underline" href="/app/settings/integrations">Set up Google Workspace or Microsoft 365</Link> (the simulator works without real credentials).
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          Connected: {enabled.map((i) => `${i.provider === "google_workspace" ? "Google Workspace" : "Microsoft 365"} (${i.mode})`).join(", ")}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Accounts" className="xl:col-span-2">
          {data.rows.length === 0 ? (
            <EmptyState>No accounts yet.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>Person</th><th>Account</th><th>Provider</th><th>Status</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {data.rows.map(({ a, first, last, status }) => (
                  <tr key={a.id} className="align-top">
                    <td>{first} {last}{status === "resigned" || status === "terminated" ? <> <Badge tone="red">left</Badge></> : null}</td>
                    <td className="font-mono text-xs">{a.email}{a.groups.length ? <p className="text-slate-500">{a.groups.join(", ")}</p> : null}</td>
                    <td>{a.provider === "google_workspace" ? "Google" : "Microsoft 365"}</td>
                    <td><Badge tone={tone[a.status]}>{a.status}</Badge>{a.lastError ? <p className="max-w-56 text-xs text-red-600">{a.lastError}</p> : null}</td>
                    <td className="text-xs text-slate-500">{formatDateTime(a.updatedAt, ctx.tenant.timezone)}</td>
                    <td className="space-y-1">
                      {a.status === "error" || a.status === "pending" ? <ActionForm action={retryProvisionAction.bind(null, a.id)} submitLabel="Retry" variant="secondary" inline /> : null}
                      {a.status === "active" ? <ActionForm action={resetPasswordAction.bind(null, a.id)} submitLabel="Reset password" variant="ghost" inline /> : null}
                      {a.status === "active" ? <ActionForm action={suspendAction.bind(null, a.id)} submitLabel="Suspend" variant="ghost" inline confirm="Revoke sessions and suspend this account?" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {enabled.length ? (
          <Card title="Create an account">
            <ActionForm action={createAccountAction} submitLabel="Create" resetOnSuccess>
              <Field label="Employee">
                <Select name="employeeId" required>
                  <option value="">Choose…</option>
                  {data.people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}</option>)}
                </Select>
              </Field>
              <Field label="Provider">
                <Select name="provider">{enabled.map((i) => <option key={i.provider} value={i.provider}>{i.provider === "google_workspace" ? "Google Workspace" : "Microsoft 365"}</option>)}</Select>
              </Field>
              <Field label="Email" hint="Leave empty for firstname.lastname@domain."><Input name="email" type="email" /></Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
