"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { purchaseOrders, vendors } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { createPurchaseOrder, receiveGoods, submitPurchaseOrder } from "@/lib/procurement";

const vendorSchema = z.object({
  name: z.string().trim().min(2, "Enter the vendor name.").max(160),
  email: z.union([z.literal(""), z.email("Enter a valid email.")]),
  phone: z.string().trim().max(40),
  taxNo: z.string().trim().max(40),
  address: z.string().trim().max(300),
});

export async function addVendorAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("procurement.manage", async (tx, actor) => {
    const d = vendorSchema.parse(Object.fromEntries(fd));
    const [v] = await tx
      .insert(vendors)
      .values({ tenantId: actor.tenantId, name: d.name, email: d.email || null, phone: d.phone || null, taxNo: d.taxNo || null, address: d.address || null })
      .returning({ id: vendors.id });
    await audit(tx, actor, { action: "vendor.created", entityType: "vendor", entityId: v.id, after: { name: d.name } });
    return `${d.name} added.`;
  }, ["/app/procurement"]);
}

export async function createPoAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await act("procurement.manage", async (tx, actor, ctx) => {
    const lines = [0, 1, 2, 3, 4]
      .map((i) => ({
        categoryId: String(fd.get(`cat_${i}`) ?? ""),
        description: String(fd.get(`desc_${i}`) ?? "").trim(),
        quantity: Number(fd.get(`qty_${i}`) || 0),
        unitCost: Number(fd.get(`cost_${i}`) || 0),
      }))
      .filter((l) => l.categoryId && l.quantity > 0);
    if (lines.some((l) => !l.description)) throw new UserError("Describe every line.");
    const po = await createPurchaseOrder(tx, actor, {
      vendorId: z.uuid("Choose a vendor.").parse(fd.get("vendorId")),
      currency: ctx.tenant.currency,
      quoteRef: String(fd.get("quoteRef") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
      assetRequestId: String(fd.get("assetRequestId") ?? "") || null,
      lines,
    });
    id = po.id;
  });
  if (res?.error) return res;
  redirect(`/app/procurement/${id}`);
}

export async function submitPoAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("procurement.manage", async (tx, actor) => {
    const r = await submitPurchaseOrder(tx, actor, id);
    return r.status === "pending" ? "Sent for approval." : "Approved and issued.";
  }, [`/app/procurement/${id}`]);
}

export async function cancelPoAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("procurement.manage", async (tx, actor) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po || !["draft", "rejected"].includes(po.status)) throw new UserError("Only draft or rejected orders can be cancelled.");
    await tx.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, id));
    await audit(tx, actor, { action: "purchase_order.cancelled", entityType: "purchase_order", entityId: id });
    return "Cancelled.";
  }, [`/app/procurement/${id}`]);
}

export async function receiveAction(id: string, lineIds: string[], _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("procurement.manage", async (tx, actor) => {
    const r = await receiveGoods(tx, actor, {
      poId: id,
      notes: String(fd.get("notes") ?? "").trim() || null,
      lines: lineIds.map((lid) => ({
        poLineId: lid,
        quantity: Number(fd.get(`recv_${lid}`) || 0),
        serials: String(fd.get(`serials_${lid}`) ?? "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      })),
    });
    return `${r.grn}: ${r.assets.length} asset(s) added to the register.`;
  }, [`/app/procurement/${id}`]);
}
