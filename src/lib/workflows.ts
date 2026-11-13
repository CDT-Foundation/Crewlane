import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { approvalActions, approvalRequests, employees, workflows, type WorkflowStep } from "@/db/schema";
import { audit, emit, type Actor } from "./audit";
import { effectiveAssignee } from "./delegations";
import { UserError } from "./errors";
import {
  fulfilAssetRequest, issuePurchaseOrder, openClearanceForExit, rejectAssetRequest, rejectPurchaseOrder,
} from "./fulfilment";
import { notifyEmployees, notifyUsers, userIdsWithRole } from "./notify";
import { MANAGER_STEP, resolveSteps, TRIGGERS } from "./workflow-rules";

type Payload = Record<string, unknown>;

/** What happens when a request is fully approved. Runs in the same transaction. */
const APPLY: Record<string, (tx: Tx, actor: Actor, subjectId: string, payload: Payload) => Promise<void>> = {
  "employee.bank_change": async (tx, actor, id, p) => {
    const [before] = await tx
      .select({ bankName: employees.bankName, bankAccount: employees.bankAccount })
      .from(employees)
      .where(eq(employees.id, id));
    await tx
      .update(employees)
      .set({ bankName: String(p.bankName), bankAccount: String(p.bankAccount), updatedAt: new Date() })
      .where(eq(employees.id, id));
    await audit(tx, actor, {
      action: "employee.bank_changed",
      entityType: "employee",
      entityId: id,
      before: { bankName: before?.bankName, bankAccountLast4: before?.bankAccount?.slice(-4) },
      after: { bankName: p.bankName, bankAccountLast4: String(p.bankAccount).slice(-4) },
    });
  },
  "employee.status_change": async (tx, actor, id, p) => {
    const status = p.status === "terminated" ? "terminated" : "resigned";
    await tx
      .update(employees)
      .set({ status, exitDate: String(p.exitDate), updatedAt: new Date() })
      .where(eq(employees.id, id));
    await audit(tx, actor, {
      action: `employee.${status}`,
      entityType: "employee",
      entityId: id,
      after: { status, exitDate: p.exitDate, reason: p.reason ?? null },
    });
    await openClearanceForExit(tx, actor, id, String(p.exitDate));
    await emit(tx, actor.tenantId, "employee.offboarding_started", {
      employeeId: id,
      status,
      exitDate: p.exitDate,
    });
  },
};

APPLY["asset.request"] = (tx, actor, id) => fulfilAssetRequest(tx, actor, id);
APPLY["purchase_order.issue"] = (tx, actor, id) => issuePurchaseOrder(tx, actor, id);

const REJECT: Record<string, (tx: Tx, actor: Actor, subjectId: string) => Promise<void>> = {
  "asset.request": rejectAssetRequest,
  "purchase_order.issue": rejectPurchaseOrder,
};

/** Fills in who a "@manager" step goes to. No manager → the owner role decides. */
async function resolveManagerSteps(tx: Tx, steps: WorkflowStep[], subjectEmployeeId: string | null | undefined) {
  let managerId: string | null = null;
  if (subjectEmployeeId) {
    const [e] = await tx.select({ managerId: employees.managerId }).from(employees).where(eq(employees.id, subjectEmployeeId));
    managerId = e?.managerId ?? null;
  }
  return steps.map((s) =>
    s.approverRole === MANAGER_STEP
      ? managerId
        ? { ...s, approverEmployeeId: managerId }
        : { ...s, approverRole: "owner", name: `${s.name} (no manager on record: owner)` }
      : s,
  );
}

/** Tell whoever must decide the current step that it is waiting for them. */
async function notifyStep(tx: Tx, tenantId: string, req: { id: string; title: string; requestedBy: string }, step: WorkflowStep) {
  const note = { kind: "approval", title: `Approval needed: ${req.title}`, body: `Step: ${step.name}`, href: "/app/approvals" };
  if (step.approverEmployeeId) {
    await notifyEmployees(tx, tenantId, [await effectiveAssignee(tx, step.approverEmployeeId)], note);
  } else {
    const ids = (await userIdsWithRole(tx, step.approverRole)).filter((u) => u !== req.requestedBy);
    await notifyUsers(tx, tenantId, ids, note);
  }
}

export type StartResult = { status: "pending"; requestId: string } | { status: "applied" };

/**
 * Raises an approval request for a high-risk action. Uses the tenant's active
 * workflow for the trigger, or the built-in maker-checker fallback.
 */
export async function startApproval(
  tx: Tx,
  actor: Actor & { userId: string },
  input: {
    trigger: string;
    title: string;
    subjectType: string;
    subjectId: string;
    payload: Payload;
    /** Employee whose line manager handles "@manager" steps. */
    subjectEmployeeId?: string | null;
  },
): Promise<StartResult> {
  const spec = TRIGGERS[input.trigger];
  if (!spec) throw new Error(`Unknown trigger ${input.trigger}`);

  const [wf] = await tx
    .select()
    .from(workflows)
    .where(and(eq(workflows.trigger, input.trigger), eq(workflows.active, true)))
    .limit(1);
  const def = wf?.definition ?? spec.fallback;
  const steps = await resolveManagerSteps(tx, resolveSteps(def, input.payload), input.subjectEmployeeId ?? input.subjectId);

  if (steps.length === 0) {
    await APPLY[input.trigger](tx, actor, input.subjectId, input.payload);
    return { status: "applied" };
  }

  const [req] = await tx
    .insert(approvalRequests)
    .values({
      tenantId: actor.tenantId,
      workflowId: wf?.id ?? null,
      trigger: input.trigger,
      title: input.title,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      payload: input.payload,
      steps,
      makerChecker: def.makerChecker,
      requestedBy: actor.userId,
    })
    .returning({ id: approvalRequests.id });

  await audit(tx, actor, {
    action: "approval.requested",
    entityType: "approval_request",
    entityId: req.id,
    after: { trigger: input.trigger, subjectId: input.subjectId, steps: steps.map((s) => s.approverRole) },
  });
  await emit(tx, actor.tenantId, "approval.requested", { requestId: req.id, trigger: input.trigger });
  await notifyStep(tx, actor.tenantId, { id: req.id, title: input.title, requestedBy: actor.userId }, steps[0]);
  return { status: "pending", requestId: req.id };
}

export class ApprovalError extends UserError {}

/**
 * Records a decision on the current step. The database guard trigger also
 * enforces maker-checker and step order, so this cannot be bypassed by
 * calling the table directly.
 */
export async function decide(
  tx: Tx,
  actor: Actor & { userId: string },
  input: {
    requestId: string;
    decision: "approve" | "reject";
    comment?: string;
    actorRoles: string[];
    /** The actor's own employee id plus anyone they are acting for. */
    actorEmployeeIds?: string[];
  },
) {
  const [req] = await tx
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, input.requestId))
    .for("update");
  if (!req) throw new ApprovalError("Request not found.");
  if (req.status !== "pending") throw new ApprovalError("This request has already been decided.");
  if (req.makerChecker && req.requestedBy === actor.userId) {
    throw new ApprovalError("Maker-checker: you raised this request, so another officer must decide it.");
  }
  const step = req.steps[req.currentStep];
  if (!step) throw new ApprovalError("Request has no pending step.");
  if (step.approverEmployeeId) {
    const allowed = (input.actorEmployeeIds ?? []).includes(step.approverEmployeeId) || input.actorRoles.includes("owner");
    if (!allowed) throw new ApprovalError("This step is for the requester's line manager (or whoever is acting for them).");
  } else if (!input.actorRoles.includes(step.approverRole) && !input.actorRoles.includes("owner")) {
    throw new ApprovalError(`This step needs the "${step.approverRole}" role.`);
  }

  await tx.insert(approvalActions).values({
    tenantId: actor.tenantId,
    requestId: req.id,
    step: req.currentStep,
    actorUserId: actor.userId,
    decision: input.decision,
    comment: input.comment || null,
  });

  const isLast = req.currentStep >= req.steps.length - 1;
  if (input.decision === "reject") {
    await tx
      .update(approvalRequests)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(eq(approvalRequests.id, req.id));
    await REJECT[req.trigger]?.(tx, actor, req.subjectId);
    await notifyUsers(tx, actor.tenantId, [req.requestedBy], {
      kind: "approval", title: `Rejected: ${req.title}`, body: input.comment ?? undefined, href: "/app/approvals",
    });
  } else if (isLast) {
    await tx
      .update(approvalRequests)
      .set({ status: "approved", decidedAt: new Date() })
      .where(eq(approvalRequests.id, req.id));
    await APPLY[req.trigger]?.(tx, actor, req.subjectId, req.payload);
    await notifyUsers(tx, actor.tenantId, [req.requestedBy], { kind: "approval", title: `Approved: ${req.title}`, href: "/app/approvals" });
  } else {
    await tx
      .update(approvalRequests)
      .set({ currentStep: req.currentStep + 1 })
      .where(eq(approvalRequests.id, req.id));
    await notifyStep(tx, actor.tenantId, req, req.steps[req.currentStep + 1]);
  }

  await audit(tx, actor, {
    action: `approval.${input.decision === "approve" ? "approved" : "rejected"}`,
    entityType: "approval_request",
    entityId: req.id,
    after: { step: req.currentStep, stepName: step.name, comment: input.comment || null, final: isLast },
  });
  return { trigger: req.trigger, final: isLast || input.decision === "reject" };
}

export async function cancelRequest(tx: Tx, actor: Actor & { userId: string }, requestId: string) {
  const [req] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId));
  if (!req || req.status !== "pending") throw new ApprovalError("Only pending requests can be cancelled.");
  if (req.requestedBy !== actor.userId) throw new ApprovalError("Only the requester can cancel.");
  await tx
    .update(approvalRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(eq(approvalRequests.id, requestId));
  await REJECT[req.trigger]?.(tx, actor, req.subjectId);
  await audit(tx, actor, { action: "approval.cancelled", entityType: "approval_request", entityId: requestId });
}
