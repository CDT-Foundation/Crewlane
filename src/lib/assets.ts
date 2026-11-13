import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetCategories, assetEvents, assets, employees, payrollDeductions } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { resolveClearanceItemsFor } from "./clearance";
import { nextNumber } from "./counters";
import { sha256Hex } from "./crypto";
import { bookValueAt } from "./depreciation";
import { UserError } from "./errors";
import { notifyEmployees } from "./notify";
import { isoDateFromNow } from "./utils";

type Asset = typeof assets.$inferSelect;
type Category = typeof assetCategories.$inferSelect;

export function netBookValue(a: Asset, c: Category, asOf = isoDateFromNow(0)) {
  if (!a.purchaseDate) return Number(a.purchaseCost);
  return bookValueAt(
    {
      cost: Number(a.purchaseCost),
      salvage: Number(a.salvageValue),
      purchaseDate: a.purchaseDate,
      method: c.method,
      usefulLifeMonths: c.usefulLifeMonths,
      wdvRatePct: Number(c.wdvRate),
    },
    asOf,
  );
}

export type NewAsset = {
  categoryId: string;
  name: string;
  make?: string | null;
  model?: string | null;
  serialNo?: string | null;
  rfid?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: string;
  salvageValue?: string;
  currency: string;
  vendorId?: string | null;
  warrantyUntil?: string | null;
  locationUnitId?: string | null;
  poLineId?: string | null;
  condition?: Asset["condition"];
  notes?: string | null;
};

export async function createAsset(tx: Tx, actor: Actor, data: NewAsset, eventNote?: string) {
  const tag = await nextNumber(tx, "asset", "AST");
  const [a] = await tx
    .insert(assets)
    .values({ tenantId: actor.tenantId, tag, ...data })
    .returning();
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId, assetId: a.id, type: "created", actorUserId: actor.userId, notes: eventNote ?? null,
  });
  await audit(tx, actor, { action: "asset.created", entityType: "asset", entityId: a.id, after: { tag, name: a.name, cost: a.purchaseCost } });
  return a;
}

async function lockAsset(tx: Tx, assetId: string) {
  const [a] = await tx.select().from(assets).where(eq(assets.id, assetId)).for("update");
  if (!a) throw new UserError("Asset not found.");
  return a;
}

function signature(actor: Actor, assetId: string, employeeId: string, name: string, at: Date) {
  return sha256Hex([actor.tenantId, assetId, employeeId, name.trim(), at.toISOString()].join("|"));
}

/** Hands an asset to an employee. A typed name is the e-signature on the handover form. */
export async function assignAsset(
  tx: Tx,
  actor: Actor,
  input: {
    assetId: string;
    employeeId: string;
    signatureName?: string | null;
    condition?: Asset["condition"];
    notes?: string | null;
    requestId?: string | null;
  },
) {
  const a = await lockAsset(tx, input.assetId);
  if (a.status !== "in_stock") throw new UserError(`${a.tag} is not in stock (status: ${a.status}).`);
  const [emp] = await tx.select().from(employees).where(eq(employees.id, input.employeeId));
  if (!emp) throw new UserError("Employee not found.");
  if (emp.status === "resigned" || emp.status === "terminated") throw new UserError("You cannot issue assets to someone who has left.");
  const at = new Date();
  await tx
    .update(assets)
    .set({ status: "assigned", custodianEmployeeId: input.employeeId, condition: input.condition ?? a.condition, updatedAt: at })
    .where(eq(assets.id, a.id));
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId,
    assetId: a.id,
    type: "assigned",
    employeeId: input.employeeId,
    actorUserId: actor.userId,
    condition: input.condition ?? a.condition,
    signatureName: input.signatureName || null,
    signatureHash: input.signatureName ? signature(actor, a.id, input.employeeId, input.signatureName, at) : null,
    notes: input.notes ?? null,
    requestId: input.requestId ?? null,
  });
  await audit(tx, actor, { action: "asset.assigned", entityType: "asset", entityId: a.id, after: { tag: a.tag, employeeId: input.employeeId } });
  await notifyEmployees(tx, actor.tenantId, [input.employeeId], {
    kind: "asset", title: `${a.tag} ${a.name} has been issued to you`, href: `/app/assets/${a.id}`, email: false,
  });
}

/** Records the employee's signature on an already-allocated asset. */
export async function signHandover(tx: Tx, actor: Actor, assetId: string, signatureName: string) {
  const a = await lockAsset(tx, assetId);
  if (a.status !== "assigned" || !a.custodianEmployeeId) throw new UserError("This asset is not issued to anyone.");
  const at = new Date();
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId,
    assetId,
    type: "assigned",
    employeeId: a.custodianEmployeeId,
    actorUserId: actor.userId,
    signatureName,
    signatureHash: signature(actor, assetId, a.custodianEmployeeId, signatureName, at),
    notes: "Handover signed",
  });
  await audit(tx, actor, { action: "asset.handover_signed", entityType: "asset", entityId: assetId });
}

export async function returnAsset(
  tx: Tx,
  actor: Actor,
  input: { assetId: string; condition: Asset["condition"]; signatureName?: string | null; notes?: string | null },
) {
  const a = await lockAsset(tx, input.assetId);
  if (a.status !== "assigned" || !a.custodianEmployeeId) throw new UserError(`${a.tag} is not issued to anyone.`);
  const at = new Date();
  const damaged = input.condition === "damaged" || input.condition === "poor";
  await tx
    .update(assets)
    .set({ status: damaged ? "in_repair" : "in_stock", custodianEmployeeId: null, condition: input.condition, updatedAt: at })
    .where(eq(assets.id, a.id));
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId,
    assetId: a.id,
    type: "returned",
    employeeId: a.custodianEmployeeId,
    actorUserId: actor.userId,
    condition: input.condition,
    signatureName: input.signatureName || null,
    signatureHash: input.signatureName ? signature(actor, a.id, a.custodianEmployeeId, input.signatureName, at) : null,
    notes: input.notes ?? null,
  });
  await audit(tx, actor, {
    action: "asset.returned", entityType: "asset", entityId: a.id, after: { tag: a.tag, from: a.custodianEmployeeId, condition: input.condition },
  });
  await resolveClearanceItemsFor(tx, actor, "asset_return", a.id, "done");
}

/** Marks an asset lost. Optionally charges the custodian its net book value via payroll. */
export async function markLost(tx: Tx, actor: Actor, input: { assetId: string; charge: boolean; notes?: string | null }) {
  const a = await lockAsset(tx, input.assetId);
  if (a.status === "disposed" || a.status === "lost") throw new UserError("This asset is already written off.");
  const [cat] = await tx.select().from(assetCategories).where(eq(assetCategories.id, a.categoryId));
  const nbv = netBookValue(a, cat);
  let deductionId: string | null = null;
  if (input.charge && a.custodianEmployeeId && nbv > 0) {
    const [d] = await tx
      .insert(payrollDeductions)
      .values({
        tenantId: actor.tenantId,
        employeeId: a.custodianEmployeeId,
        source: "asset_loss",
        reference: a.tag,
        description: `Loss of ${a.tag} ${a.name} (net book value)`,
        amount: nbv.toFixed(2),
        currency: a.currency,
        createdBy: actor.userId,
      })
      .returning({ id: payrollDeductions.id });
    deductionId = d.id;
  }
  await tx.update(assets).set({ status: "lost", updatedAt: new Date() }).where(eq(assets.id, a.id));
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId, assetId: a.id, type: "lost", employeeId: a.custodianEmployeeId, actorUserId: actor.userId,
    notes: [input.notes, deductionId ? `Payroll deduction ${nbv.toFixed(2)} ${a.currency}` : null].filter(Boolean).join(" · ") || null,
  });
  await audit(tx, actor, { action: "asset.lost", entityType: "asset", entityId: a.id, after: { nbv, charged: Boolean(deductionId) } });
  await resolveClearanceItemsFor(tx, actor, "asset_return", a.id, "lost", deductionId);
  return { nbv, deductionId };
}

export async function setRepair(tx: Tx, actor: Actor, assetId: string, inRepair: boolean, notes?: string | null) {
  const a = await lockAsset(tx, assetId);
  if (inRepair && a.status === "assigned") throw new UserError("Take the asset back from its custodian first.");
  if (!inRepair && a.status !== "in_repair") throw new UserError("This asset is not in repair.");
  await tx.update(assets).set({ status: inRepair ? "in_repair" : "in_stock", updatedAt: new Date() }).where(eq(assets.id, assetId));
  await tx.insert(assetEvents).values({
    tenantId: actor.tenantId, assetId, type: inRepair ? "repair_out" : "repair_in", actorUserId: actor.userId, notes: notes ?? null,
  });
  await audit(tx, actor, { action: inRepair ? "asset.repair_out" : "asset.repair_in", entityType: "asset", entityId: assetId });
}

export async function disposeAsset(tx: Tx, actor: Actor, assetId: string, notes: string) {
  const a = await lockAsset(tx, assetId);
  if (a.status === "assigned") throw new UserError("Take the asset back before disposing of it.");
  if (a.status === "disposed") throw new UserError("Already disposed.");
  await tx.update(assets).set({ status: "disposed", disposedAt: isoDateFromNow(0), updatedAt: new Date() }).where(eq(assets.id, assetId));
  await tx.insert(assetEvents).values({ tenantId: actor.tenantId, assetId, type: "disposed", actorUserId: actor.userId, notes });
  await audit(tx, actor, { action: "asset.disposed", entityType: "asset", entityId: assetId, after: { notes } });
}

/** In-stock assets of a category, oldest first, for allocation. */
export function stockOf(tx: Tx, categoryId: string, limit: number) {
  return tx
    .select()
    .from(assets)
    .where(and(eq(assets.categoryId, categoryId), eq(assets.status, "in_stock")))
    .orderBy(assets.createdAt)
    .limit(limit)
    .for("update", { skipLocked: true });
}
