import { asc } from "drizzle-orm";
import { Badge, Card, PageHeader } from "@/components/ui";
import { roles, workflows } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { MANAGER_STEP, TRIGGERS } from "@/lib/workflow-rules";
import { saveWorkflowAction } from "./actions";
import { WorkflowBuilder } from "./builder";

export default async function WorkflowsPage() {
  const ctx = await requirePage("workflows.manage");
  const { rows, roleOptions } = await tenantTx(ctx, async (tx) => ({
    rows: await tx.select().from(workflows),
    roleOptions: await tx.select({ key: roles.key, name: roles.name }).from(roles).orderBy(asc(roles.name)),
  }));

  return (
    <>
      <PageHeader
        title="Workflows"
        description="No-code approval chains. Add steps, pick who approves each one and add conditions. Phase 2 adds asset requests and purchase orders here."
      />
      <div className="space-y-6">
        {Object.entries(TRIGGERS).map(([trigger, spec]) => {
          const wf = rows.find((r) => r.trigger === trigger);
          const def = wf?.definition ?? spec.fallback;
          return (
            <Card
              key={trigger}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {spec.label}
                  <span className="font-mono text-xs font-normal text-slate-500">{trigger}</span>
                  {wf?.active === false ? <Badge>inactive · using default</Badge> : <Badge tone="green">active</Badge>}
                  {wf ? <Badge>v{wf.version}</Badge> : null}
                </span>
              }
            >
              <p className="mb-4 text-sm text-slate-600">{spec.description}</p>
              <WorkflowBuilder
                action={saveWorkflowAction.bind(null, trigger)}
                initial={def}
                active={wf?.active ?? true}
                roles={[{ key: MANAGER_STEP, name: "Line manager of the requester" }, ...roleOptions]}
                fields={spec.fields}
              />
            </Card>
          );
        })}
      </div>
    </>
  );
}
