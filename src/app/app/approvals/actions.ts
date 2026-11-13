"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, run } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { metrics } from "@/lib/metrics";
import { approverIdentity, requireAction, tenantTx } from "@/lib/session";
import { cancelRequest, decide } from "@/lib/workflows";

export async function decideAction(requestId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction();
    const who = approverIdentity(ctx);
    const decision = z.enum(["approve", "reject"]).parse(fd.get("decision"));
    const comment = String(fd.get("comment") ?? "").trim().slice(0, 500);
    if (decision === "reject" && !comment) throw new UserError("Add a reason when rejecting.");
    const res = await tenantTx(ctx, (tx) =>
      decide(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        requestId, decision, comment, actorRoles: who.roles, actorEmployeeIds: who.employeeIds,
      }),
    );
    metrics.approvals.inc({ trigger: res.trigger, decision });
    revalidatePath("/app/approvals");
    return decision === "approve" ? (res.final ? "Approved and applied." : "Approved. Sent to the next step.") : "Rejected.";
  });
}

export async function cancelAction(requestId: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction();
    await tenantTx(ctx, (tx) => cancelRequest(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, requestId));
    revalidatePath("/app/approvals");
    return "Cancelled.";
  });
}
