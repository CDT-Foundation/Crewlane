import { eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetCategories, assetRequests, goodsReceipts, poLines, purchaseOrders, vendors } from "@/db/schema";
import { createAsset } from "./assets";
import { audit, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { UserError } from "./errors";
import { fulfilAssetRequest } from "./fulfilment";
import { isoDateFromNow } from "./utils";
import { startApproval } from "./workflows";

export type PoLineInput = { categoryId: string; description: string; quantity: number; unitCost: number };

export async function createPurchaseOrder(
  tx: Tx,
  actor: Actor,
  input: { vendorId: string; currency: string; quoteRef?: string | null; notes?: string | null; assetRequestId?: string | null; lines: PoLineInput[] },
) {
  if (input.lines.length === 0) throw new UserError("Add at least one line.");
  const [v] = await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendorId));
  if (!v) throw new UserError("Choose a vendor.");
  for (const l of input.lines) {
    if (l.quantity < 1 || l.unitCost < 0) throw new UserError("Check quantities and prices.");
  }
  const total = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const number = await nextNumber(tx, "po", "PO");
  const [po] = await tx
    .insert(purchaseOrders)
    .values({
      tenantId: actor.tenantId, number, vendorId: input.vendorId, currency: input.currency, quoteRef: input.quoteRef ?? null,
      notes: input.notes ?? null, assetRequestId: input.assetRequestId ?? null, total: total.toFixed(2), createdBy: actor.userId,
    })
    .returning();
  await tx.insert(poLines).values(
    input.lines.map((l) => ({
      tenantId: actor.tenantId, poId: po.id, categoryId: l.categoryId, description: l.description, quantity: l.quantity, unitCost: l.unitCost.toFixed(2),
    })),
  );
  await audit(tx, actor, { action: "purchase_order.created", entityType: "purchase_order", entityId: po.id, after: { number, total } });
  return po;
}

/** Sends a draft PO through its approval workflow. */
export async function submitPurchaseOrder(tx: Tx, actor: Actor & { userId: string }, poId: string) {
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).for("update");
  if (!po) throw new UserError("Purchase order not found.");
  if (po.status !== "draft") throw new UserError("Only draft purchase orders can be submitted.");
  await tx.update(purchaseOrders).set({ status: "pending_approval" }).where(eq(purchaseOrders.id, poId));
  const [vendor] = await tx.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, po.vendorId));
  const r = await startApproval(tx, actor, {
    trigger: "purchase_order.issue",
    title: `${po.number} to ${vendor?.name ?? "vendor"}: ${po.currency} ${Number(po.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    subjectType: "purchase_order",
    subjectId: poId,
    subjectEmployeeId: null,
    payload: { amount: Number(po.total) },
  });
  if (r.status === "pending") await tx.update(purchaseOrders).set({ approvalRequestId: r.requestId }).where(eq(purchaseOrders.id, poId));
  return r;
}

/**
 * Goods received note: creates one asset per unit received (with serials if
 * given), updates the PO, then tries to fill any request waiting for stock.
 */
export async function receiveGoods(
  tx: Tx,
  actor: Actor,
  input: { poId: string; notes?: string | null; lines: { poLineId: string; quantity: number; serials: string[] }[] },
) {
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).for("update");
  if (!po) throw new UserError("Purchase order not found.");
  if (!["issued", "partially_received"].includes(po.status)) throw new UserError("Only issued purchase orders can be received.");
  const lines = await tx.select().from(poLines).where(eq(poLines.poId, po.id));
  const received = input.lines.filter((l) => l.quantity > 0);
  if (received.length === 0) throw new UserError("Enter at least one quantity received.");
  const created: string[] = [];
  for (const r of received) {
    const line = lines.find((l) => l.id === r.poLineId);
    if (!line) throw new UserError("Unknown PO line.");
    if (line.receivedQty + r.quantity > line.quantity) throw new UserError(`More than ordered for "${line.description}".`);
    const [cat] = await tx.select().from(assetCategories).where(eq(assetCategories.id, line.categoryId));
    for (let i = 0; i < r.quantity; i++) {
      const a = await createAsset(
        tx,
        actor,
        {
          categoryId: line.categoryId, name: line.description, serialNo: r.serials[i]?.trim() || null,
          purchaseDate: isoDateFromNow(0), purchaseCost: line.unitCost, currency: po.currency, vendorId: po.vendorId,
          poLineId: line.id, condition: "new",
        },
        `Received on ${po.number}`,
      );
      created.push(`${a.tag} (${cat?.code})`);
    }
    await tx.update(poLines).set({ receivedQty: line.receivedQty + r.quantity }).where(eq(poLines.id, line.id));
  }
  const after = await tx.select().from(poLines).where(eq(poLines.poId, po.id));
  const done = after.every((l) => l.receivedQty >= l.quantity);
  const number = await nextNumber(tx, "grn", "GRN");
  await tx.insert(goodsReceipts).values({ tenantId: actor.tenantId, number, poId: po.id, receivedBy: actor.userId, notes: input.notes ?? null, lines: received });
  await tx.update(purchaseOrders).set({ status: done ? "received" : "partially_received" }).where(eq(purchaseOrders.id, po.id));
  await audit(tx, actor, { action: "goods.received", entityType: "purchase_order", entityId: po.id, after: { grn: number, assets: created } });

  // Fill the linked request, then any other request waiting for stock.
  const waiting = await tx
    .select({ id: assetRequests.id })
    .from(assetRequests)
    .where(inArray(assetRequests.status, ["awaiting_stock"]))
    .orderBy(assetRequests.createdAt);
  const order = po.assetRequestId ? [po.assetRequestId, ...waiting.map((w) => w.id).filter((x) => x !== po.assetRequestId)] : waiting.map((w) => w.id);
  for (const id of order) await fulfilAssetRequest(tx, actor, id);
  return { grn: number, assets: created };
}
