import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetCategories, assetRequestLines, assetRequests, employees } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { UserError } from "./errors";
import { fulfilAssetRequest } from "./fulfilment";
import { startApproval } from "./workflows";

export type RequestLine = { categoryId: string; description: string; quantity: number; estimatedUnitCost: number };

export async function createAssetRequest(
  tx: Tx,
  actor: Actor,
  input: { forEmployeeId: string; reason?: string | null; lines: RequestLine[]; source: "self_service" | "onboarding" | "manager" },
) {
  if (input.lines.length === 0) throw new UserError("Add at least one item.");
  const [emp] = await tx.select().from(employees).where(eq(employees.id, input.forEmployeeId));
  if (!emp) throw new UserError("Employee not found.");
  for (const l of input.lines) {
    const [c] = await tx.select({ id: assetCategories.id }).from(assetCategories).where(eq(assetCategories.id, l.categoryId));
    if (!c) throw new UserError("Choose a category for every item.");
    if (l.quantity < 1 || l.quantity > 100) throw new UserError("Quantities must be between 1 and 100.");
  }
  const total = input.lines.reduce((s, l) => s + l.quantity * l.estimatedUnitCost, 0);
  const number = await nextNumber(tx, "asset_request", "REQ");
  const [req] = await tx
    .insert(assetRequests)
    .values({
      tenantId: actor.tenantId,
      number,
      forEmployeeId: input.forEmployeeId,
      requestedBy: actor.userId,
      reason: input.reason ?? null,
      source: input.source,
      estimatedTotal: total.toFixed(2),
      status: input.source === "onboarding" ? "approved" : "pending_approval",
    })
    .returning();
  await tx.insert(assetRequestLines).values(
    input.lines.map((l) => ({
      tenantId: actor.tenantId, requestId: req.id, categoryId: l.categoryId, description: l.description,
      quantity: l.quantity, estimatedUnitCost: l.estimatedUnitCost.toFixed(2),
    })),
  );
  await audit(tx, actor, { action: "asset_request.created", entityType: "asset_request", entityId: req.id, after: { number, total, source: input.source } });

  if (input.source === "onboarding") {
    // Equipment kits are pre-approved by policy.
    await fulfilAssetRequest(tx, actor, req.id);
    return req;
  }
  if (!actor.userId) throw new UserError("A signed-in user must raise this request.");
  const r = await startApproval(tx, { ...actor, userId: actor.userId }, {
    trigger: "asset.request",
    title: `${number}: equipment for ${emp.firstName} ${emp.lastName}`,
    subjectType: "asset_request",
    subjectId: req.id,
    subjectEmployeeId: emp.id,
    payload: { amount: total, items: input.lines.map((l) => `${l.quantity} × ${l.description}`).join(", ") },
  });
  if (r.status === "pending") {
    await tx.update(assetRequests).set({ approvalRequestId: r.requestId }).where(eq(assetRequests.id, req.id));
  }
  return req;
}
