import { and, desc, eq, inArray, ne } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader, Select, statusTone, Textarea } from "@/components/ui";
import { approvalActions, approvalRequests, user } from "@/db/schema";
import { maskTail } from "@/lib/crypto";
import { pendingForMe } from "@/lib/queries";
import { type AppContext, requirePage, tenantTx } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { TRIGGERS } from "@/lib/workflow-rules";
import { cancelAction, decideAction } from "./actions";

type Request = typeof approvalRequests.$inferSelect;

function PayloadSummary({ r, ctx }: { r: Request; ctx: AppContext }) {
  const p = r.payload;
  if (r.trigger === "employee.bank_change") {
    const acct = String(p.bankAccount ?? "");
    return (
      <p className="text-sm text-slate-700">
        New account: {String(p.bankName)} · <span className="font-mono">{ctx.can("employees.sensitive") ? acct : maskTail(acct)}</span>
      </p>
    );
  }
  if (r.trigger === "asset.request" || r.trigger === "purchase_order.issue") {
    return (
      <p className="text-sm text-slate-700">
        {p.items ? <>{String(p.items)} · </> : null}
        {ctx.tenant.currency} {Number(p.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
        <Link className="text-brand hover:underline" href={r.trigger === "asset.request" ? `/app/assets/requests/${r.subjectId}` : `/app/procurement/${r.subjectId}`}>open</Link>
      </p>
    );
  }
  if (r.trigger === "employee.status_change") {
    return (
      <p className="text-sm text-slate-700">
        {String(p.status)} · last day {String(p.exitDate)}
        {p.reason ? <> · “{String(p.reason)}”</> : null}
      </p>
    );
  }
  return null;
}

export default async function ApprovalsPage() {
  const ctx = await requirePage();

  const data = await tenantTx(ctx, async (tx) => {
    const mine = await pendingForMe(tx, ctx);
    const raised = await tx
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.requestedBy, ctx.user.id), eq(approvalRequests.status, "pending")))
      .orderBy(desc(approvalRequests.createdAt));
    const recent = await tx
      .select({ r: approvalRequests, requester: user.name })
      .from(approvalRequests)
      .leftJoin(user, eq(user.id, approvalRequests.requestedBy))
      .where(ne(approvalRequests.status, "pending"))
      .orderBy(desc(approvalRequests.decidedAt))
      .limit(20);
    const ids = [...mine, ...raised].map((r) => r.id);
    const requesterIds = [...new Set(mine.map((r) => r.requestedBy))];
    const names = requesterIds.length
      ? await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, requesterIds))
      : [];
    const actions = ids.length
      ? await tx
          .select({ a: approvalActions, name: user.name })
          .from(approvalActions)
          .leftJoin(user, eq(user.id, approvalActions.actorUserId))
          .where(inArray(approvalActions.requestId, ids))
      : [];
    return { mine, raised, recent, names: new Map(names.map((n) => [n.id, n.name])), actions };
  });

  const tz = ctx.tenant.timezone;
  const trail = (id: string) => data.actions.filter((x) => x.a.requestId === id);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="High-risk changes wait here until the right officer approves them. You can never approve a maker-checker request you raised yourself."
      />

      <div className="space-y-6">
        <Card title={`Waiting for you (${data.mine.length})`}>
          {data.mine.length === 0 ? (
            <EmptyState>Nothing needs your decision.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.mine.map((r) => {
                const step = r.steps[r.currentStep];
                return (
                  <li key={r.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[1fr_22rem]">
                    <div className="space-y-1">
                      <p className="font-medium">{r.title}</p>
                      <PayloadSummary r={r} ctx={ctx} />
                      <p className="text-xs text-slate-500">
                        {TRIGGERS[r.trigger]?.label ?? r.trigger} · raised by {data.names.get(r.requestedBy) ?? "unknown"} on{" "}
                        {formatDateTime(r.createdAt, tz)} · step {r.currentStep + 1} of {r.steps.length}: {step?.name}
                        {r.makerChecker ? " · maker-checker" : ""}
                        {step?.approverEmployeeId && step.approverEmployeeId !== ctx.employeeId ? " · you are covering for the line manager" : ""}
                      </p>
                      {trail(r.id).map(({ a, name }) => (
                        <p key={a.id} className="text-xs text-slate-500">
                          Step {a.step + 1} {a.decision}d by {name}{a.comment ? `: ${a.comment}` : ""}
                        </p>
                      ))}
                      {r.subjectType === "employee" ? (
                        <Link className="text-xs text-brand hover:underline" href={`/app/employees/${r.subjectId}`}>Open employee</Link>
                      ) : null}
                    </div>
                    <ActionForm action={decideAction.bind(null, r.id)} submitLabel="Submit decision" className="space-y-2">
                      <Field label="Decision">
                        <Select name="decision" defaultValue="approve">
                          <option value="approve">Approve</option>
                          <option value="reject">Reject</option>
                        </Select>
                      </Field>
                      <Textarea name="comment" rows={2} placeholder="Comment (required when rejecting)" />
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Raised by you">
          {data.raised.length === 0 ? (
            <EmptyState>You have no open requests.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.raised.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      Waiting on step {r.currentStep + 1}: {r.steps[r.currentStep]?.name} ({r.steps[r.currentStep]?.approverRole})
                    </p>
                  </div>
                  <ActionForm action={cancelAction.bind(null, r.id)} submitLabel="Cancel" variant="ghost" inline confirm="Cancel this request?" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recently decided">
          {data.recent.length === 0 ? (
            <EmptyState>No decisions yet.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recent.map(({ r, requester }) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-3">
                  <span>{r.title} <span className="text-slate-500">· by {requester}</span></span>
                  <span className="flex items-center gap-2 text-slate-500">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                    {formatDateTime(r.decidedAt, tz)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
