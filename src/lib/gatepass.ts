import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetEvents, assets, gatePasses } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { resolveClearanceItemsFor } from "./clearance";
import { nextNumber } from "./counters";
import { newToken, sha256Hex } from "./crypto";
import { UserError } from "./errors";

type Pass = typeof gatePasses.$inferSelect;

export async function issueGatePass(
  tx: Tx,
  actor: Actor,
  input: {
    type: Pass["type"];
    assetId?: string | null;
    description: string;
    carrierName: string;
    carrierEmployeeId?: string | null;
    destination: string;
    reason?: string | null;
    expectedReturnOn?: string | null;
  },
) {
  if (input.type === "returnable" && !input.expectedReturnOn) throw new UserError("Returnable passes need an expected return date.");
  if (input.assetId) {
    const [a] = await tx.select().from(assets).where(eq(assets.id, input.assetId));
    if (!a) throw new UserError("Asset not found.");
    if (a.status === "disposed" || a.status === "lost") throw new UserError("That asset is written off.");
  }
  const { token, hash } = newToken(18);
  const number = await nextNumber(tx, "gate_pass", "GP");
  const [p] = await tx
    .insert(gatePasses)
    .values({
      tenantId: actor.tenantId, number, type: input.type, assetId: input.assetId ?? null, description: input.description,
      carrierName: input.carrierName, carrierEmployeeId: input.carrierEmployeeId ?? null, destination: input.destination,
      reason: input.reason ?? null, expectedReturnOn: input.type === "returnable" ? input.expectedReturnOn ?? null : null,
      tokenHash: hash, issuedBy: actor.userId,
    })
    .returning();
  await audit(tx, actor, { action: "gate_pass.issued", entityType: "gate_pass", entityId: p.id, after: { number, type: p.type, assetId: p.assetId } });
  return { pass: p, token };
}

export async function findPassByToken(tx: Tx, token: string) {
  const [p] = await tx.select().from(gatePasses).where(eq(gatePasses.tokenHash, sha256Hex(token.trim())));
  return p ?? null;
}

/** Security scan at the gate: out, then (for returnable passes) back in. */
export async function scanGatePass(tx: Tx, actor: Actor, passId: string, direction: "out" | "in") {
  const [p] = await tx.select().from(gatePasses).where(eq(gatePasses.id, passId)).for("update");
  if (!p) throw new UserError("Gate pass not found.");
  const now = new Date();
  if (direction === "out") {
    if (p.status !== "approved") throw new UserError(`This pass cannot go out (status: ${p.status}).`);
    const status = p.type === "non_returnable" ? "closed" : "out";
    await tx.update(gatePasses).set({ status, outAt: now, outBy: actor.userId }).where(eq(gatePasses.id, p.id));
    if (p.assetId) {
      await tx.insert(assetEvents).values({ tenantId: actor.tenantId, assetId: p.assetId, type: "gate_out", actorUserId: actor.userId, notes: `${p.number} to ${p.destination}` });
    }
  } else {
    if (p.status !== "out") throw new UserError("This pass is not out.");
    await tx.update(gatePasses).set({ status: "returned", inAt: now, inBy: actor.userId }).where(eq(gatePasses.id, p.id));
    if (p.assetId) {
      await tx.insert(assetEvents).values({ tenantId: actor.tenantId, assetId: p.assetId, type: "gate_in", actorUserId: actor.userId, notes: p.number });
    }
    await resolveClearanceItemsFor(tx, actor, "gate_pass", p.id, "done");
  }
  await audit(tx, actor, { action: `gate_pass.${direction}`, entityType: "gate_pass", entityId: p.id, after: { number: p.number } });
}

export async function cancelGatePass(tx: Tx, actor: Actor, passId: string) {
  const [p] = await tx.select().from(gatePasses).where(eq(gatePasses.id, passId));
  if (!p || p.status !== "approved") throw new UserError("Only passes that have not gone out can be cancelled.");
  await tx.update(gatePasses).set({ status: "cancelled" }).where(eq(gatePasses.id, passId));
  await audit(tx, actor, { action: "gate_pass.cancelled", entityType: "gate_pass", entityId: passId });
}
