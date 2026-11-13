"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { roles, workflows } from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { requireAction, tenantTx } from "@/lib/session";
import { isTrigger, TRIGGERS, validateDefinition } from "@/lib/workflow-rules";

const definitionSchema = z.object({
  makerChecker: z.boolean(),
  steps: z.array(
    z.object({
      name: z.string().trim().max(80),
      approverRole: z.string().max(60),
      condition: z
        .object({
          field: z.string().max(60),
          op: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
          value: z.union([z.string().max(120), z.number()]),
        })
        .optional(),
    }),
  ),
});

export async function saveWorkflowAction(trigger: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("workflows.manage");
    if (!isTrigger(trigger)) throw new UserError("Unknown workflow.");
    const def = definitionSchema.parse(JSON.parse(String(fd.get("definition") ?? "{}")));
    const active = fd.get("active") === "on";
    // High-risk triggers must stay maker-checker.
    if (trigger === "employee.bank_change" && !def.makerChecker) {
      throw new UserError("Bank account changes must always be maker-checker.");
    }
    const fields = TRIGGERS[trigger].fields.map((f) => f.key);
    for (const s of def.steps) {
      if (s.condition && !fields.includes(s.condition.field)) throw new UserError(`Unknown field "${s.condition.field}".`);
    }

    await tenantTx(ctx, async (tx) => {
      const roleKeys = (await tx.select({ key: roles.key }).from(roles)).map((r) => r.key);
      const problem = validateDefinition(def, roleKeys);
      if (problem) throw new UserError(problem);
      const [before] = await tx.select().from(workflows).where(eq(workflows.trigger, trigger));
      if (before) {
        await tx
          .update(workflows)
          .set({ definition: def, active, version: sql`${workflows.version} + 1`, updatedAt: new Date() })
          .where(eq(workflows.id, before.id));
      } else {
        await tx.insert(workflows).values({ tenantId: ctx.tenant.id, trigger, name: TRIGGERS[trigger].label, definition: def, active });
      }
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "workflow.saved", entityType: "workflow", entityId: before?.id ?? trigger,
        before: before ? { definition: before.definition, active: before.active } : null,
        after: { definition: def, active },
      });
    });
    revalidatePath("/app/workflows");
    return "Workflow saved. New requests use it; requests already in flight keep their original steps.";
  });
}
