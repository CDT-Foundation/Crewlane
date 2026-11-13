/**
 * What happens when asset requests and purchase orders are approved or
 * rejected. Kept separate from workflows.ts (which calls into it) so there is
 * no import cycle.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetRequestLines, assetRequests, employees, purchaseOrders } from "@/db/schema";
import { assignAsset, stockOf } from "./assets";
import { audit, type Actor } from "./audit";
import { openClearance } from "./clearance";
import { notifyEmployees, notifyPermission, notifyUsers } from "./notify";

/** Allocates in-stock assets to the request. Leftovers wait for procurement. */
export async function fulfilAssetRequest(tx: Tx, actor: Actor, requestId: string) {
  const [req] = await tx.select().from(assetRequests).where(eq(assetRequests.id, requestId)).for("update");
  if (!req || !["pending_approval", "approved", "awaiting_stock"].includes(req.status)) return;
  const lines = await tx.select().from(assetRequestLines).where(eq(assetRequestLines.requestId, requestId));
  let outstanding = 0;
  const issued: string[] = [];
  for (const line of lines) {
    const need = line.quantity - line.fulfilledQty;
    if (need <= 0) continue;
    const stock = await stockOf(tx, line.categoryId, need);
    for (const a of stock) {
      await assignAsset(tx, actor, { assetId: a.id, employeeId: req.forEmployeeId, notes: `Allocated for ${req.number}; handover signature pending`, requestId });
      issued.push(`${a.tag} ${a.name}`);
    }
    await tx
      .update(assetRequestLines)
      .set({ fulfilledQty: line.fulfilledQty + stock.length })
      .where(eq(assetRequestLines.id, line.id));
    outstanding += need - stock.length;
  }
  const status = outstanding > 0 ? "awaiting_stock" : "fulfilled";
  await tx
    .update(assetRequests)
    .set({ status, decidedAt: req.decidedAt ?? new Date() })
    .where(eq(assetRequests.id, requestId));
  await audit(tx, actor, { action: `asset_request.${status}`, entityType: "asset_request", entityId: requestId, after: { issued, outstanding } });
  if (outstanding > 0 && req.status !== "awaiting_stock") {
    await notifyPermission(tx, actor.tenantId, "procurement.manage", {
      kind: "procurement",
      title: `${req.number} needs ${outstanding} item(s) that are out of stock`,
      body: "Raise a purchase order from the request.",
      href: `/app/assets/requests/${requestId}`,
    });
  }
  if (issued.length) {
    await notifyPermission(tx, actor.tenantId, "assets.manage", {
      kind: "asset",
      title: `${req.number}: hand over ${issued.length} item(s)`,
      body: issued.join(", "),
      href: `/app/assets/requests/${requestId}`,
      email: false,
    });
  }
}

export async function rejectAssetRequest(tx: Tx, actor: Actor, requestId: string) {
  const [req] = await tx
    .update(assetRequests)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(assetRequests.id, requestId), inArray(assetRequests.status, ["pending_approval"])))
    .returning();
  if (req) await notifyEmployees(tx, actor.tenantId, [req.forEmployeeId], { kind: "asset", title: `${req.number} was not approved`, href: `/app/assets/requests/${requestId}` });
}

export async function issuePurchaseOrder(tx: Tx, actor: Actor, poId: string) {
  const [po] = await tx
    .update(purchaseOrders)
    .set({ status: "issued", issuedAt: new Date() })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.status, "pending_approval")))
    .returning();
  if (!po) return;
  await audit(tx, actor, { action: "purchase_order.issued", entityType: "purchase_order", entityId: poId, after: { number: po.number, total: po.total } });
  if (po.createdBy) {
    await notifyUsers(tx, actor.tenantId, [po.createdBy], { kind: "procurement", title: `${po.number} approved and issued`, href: `/app/procurement/${poId}` });
  }
}

export async function rejectPurchaseOrder(tx: Tx, actor: Actor, poId: string) {
  await tx
    .update(purchaseOrders)
    .set({ status: "rejected" })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.status, "pending_approval")));
}

export async function openClearanceForExit(tx: Tx, actor: Actor, employeeId: string, exitDate: string) {
  const [e] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
  if (e) await openClearance(tx, actor, employeeId, exitDate);
}
