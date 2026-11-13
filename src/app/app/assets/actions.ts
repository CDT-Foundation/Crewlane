"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assetCategories, assets, equipmentKits, jobGrades } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { assignAsset, createAsset, disposeAsset, markLost, returnAsset, setRepair, signHandover } from "@/lib/assets";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";

const opt = (max = 200) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const optDate = z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.").transform((v) => (v === "" ? null : v));
const amount = z.string().trim().transform((v) => (v === "" ? "0" : v)).refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 125000.00");
const condition = z.enum(["new", "good", "fair", "poor", "damaged"]);

const assetSchema = z.object({
  categoryId: z.uuid("Choose a category."),
  name: z.string().trim().min(2, "Enter a name.").max(160),
  make: opt(), model: opt(), serialNo: opt(120), rfid: opt(120),
  purchaseDate: optDate, warrantyUntil: optDate,
  purchaseCost: amount, salvageValue: amount,
  vendorId: z.string().transform((v) => (v === "" ? null : v)),
  locationUnitId: z.string().transform((v) => (v === "" ? null : v)),
  condition, notes: opt(1000),
});

export async function createAssetAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await act("assets.manage", async (tx, actor, ctx) => {
    const d = assetSchema.parse(Object.fromEntries(fd));
    const qty = Math.min(50, Math.max(1, Number(fd.get("quantity") || 1)));
    if (qty > 1 && d.serialNo) throw new UserError("Leave the serial number empty when adding several identical items.");
    for (let i = 0; i < qty; i++) {
      const a = await createAsset(tx, actor, { ...d, currency: ctx.tenant.currency });
      id ||= a.id;
    }
    return `${qty} asset(s) added.`;
  });
  if (res?.error) return res;
  redirect(Number(fd.get("quantity") || 1) > 1 ? "/app/assets" : `/app/assets/${id}`);
}

export async function updateAssetAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const d = assetSchema.parse(Object.fromEntries(fd));
    const [before] = await tx.select().from(assets).where(eq(assets.id, id));
    if (!before) throw new UserError("Asset not found.");
    await tx.update(assets).set({ ...d, updatedAt: new Date() }).where(eq(assets.id, id));
    await audit(tx, actor, { action: "asset.updated", entityType: "asset", entityId: id, before: { name: before.name, cost: before.purchaseCost }, after: { name: d.name, cost: d.purchaseCost } });
  }, [`/app/assets/${id}`]);
}

export async function assignAssetAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const employeeId = z.uuid("Choose who receives it.").parse(fd.get("employeeId"));
    const signatureName = String(fd.get("signatureName") ?? "").trim();
    if (signatureName.length < 3) throw new UserError("The recipient must type their full name to sign the handover.");
    await assignAsset(tx, actor, { assetId: id, employeeId, signatureName, condition: condition.parse(fd.get("condition")), notes: String(fd.get("notes") ?? "") || null });
    return "Handed over and signed.";
  }, [`/app/assets/${id}`]);
}

export async function signHandoverAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const name = String(fd.get("signatureName") ?? "").trim();
    if (name.length < 3) throw new UserError("Type the recipient's full name.");
    await signHandover(tx, actor, id, name);
    return "Handover signed.";
  }, [`/app/assets/${id}`]);
}

export async function returnAssetAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    await returnAsset(tx, actor, {
      assetId: id, condition: condition.parse(fd.get("condition")),
      signatureName: String(fd.get("signatureName") ?? "").trim() || null, notes: String(fd.get("notes") ?? "") || null,
    });
    return "Return recorded.";
  }, [`/app/assets/${id}`]);
}

export async function lostAssetAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const r = await markLost(tx, actor, { assetId: id, charge: fd.get("charge") === "on", notes: String(fd.get("notes") ?? "") || null });
    return r.deductionId ? `Marked lost. A payroll deduction of ${r.nbv.toFixed(2)} was raised.` : "Marked lost.";
  }, [`/app/assets/${id}`]);
}

export async function repairAction(id: string, inRepair: boolean, _p: ActionState): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    await setRepair(tx, actor, id, inRepair);
    return inRepair ? "Sent for repair." : "Back in stock.";
  }, [`/app/assets/${id}`]);
}

export async function disposeAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const notes = String(fd.get("notes") ?? "").trim();
    if (notes.length < 3) throw new UserError("Say how it was disposed of (sold, scrapped, donated).");
    await disposeAsset(tx, actor, id, notes);
    return "Disposed.";
  }, [`/app/assets/${id}`]);
}

const categorySchema = z.object({
  code: z.string().trim().min(2).max(8).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Enter a name.").max(80),
  method: z.enum(["straight_line", "written_down_value"]),
  usefulLifeMonths: z.coerce.number().int().min(1).max(600),
  wdvRate: z.coerce.number().min(0).max(100).transform(String),
  itManaged: z.string().optional().transform((v) => v === "on"),
});

export async function saveCategoryAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const d = categorySchema.parse(Object.fromEntries(fd));
    if (id) await tx.update(assetCategories).set(d).where(eq(assetCategories.id, id));
    else await tx.insert(assetCategories).values({ tenantId: actor.tenantId, ...d });
    await audit(tx, actor, { action: "asset_category.saved", entityType: "asset_category", entityId: id ?? d.code, after: d });
  }, ["/app/assets/categories"]);
}

export async function saveKitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("assets.manage", async (tx, actor) => {
    const gradeId = String(fd.get("jobGradeId") ?? "") || null;
    const name = String(fd.get("name") ?? "").trim() || "Standard kit";
    if (gradeId) {
      const [g] = await tx.select().from(jobGrades).where(eq(jobGrades.id, gradeId));
      if (!g) throw new UserError("Choose a grade.");
    }
    const cats = await tx.select().from(assetCategories);
    const items = cats
      .map((c) => ({ categoryId: c.id, quantity: Number(fd.get(`qty_${c.id}`) || 0), description: c.name.replace(/s$/, "") }))
      .filter((i) => i.quantity > 0);
    await tx
      .insert(equipmentKits)
      .values({ tenantId: actor.tenantId, jobGradeId: gradeId, name, items })
      .onConflictDoUpdate({ target: [equipmentKits.tenantId, equipmentKits.jobGradeId], set: { name, items } });
    await audit(tx, actor, { action: "equipment_kit.saved", entityType: "equipment_kit", entityId: gradeId ?? "default", after: { name, items } });
    return "Kit saved.";
  }, ["/app/assets/categories"]);
}
