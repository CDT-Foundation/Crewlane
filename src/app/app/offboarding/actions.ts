"use server";

import { eq } from "drizzle-orm";
import { clearanceItems } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { overrideClearance, resolveItemManually } from "@/lib/clearance";
import { UserError } from "@/lib/errors";
import { suspendAccount } from "@/lib/identity-jobs";
import { revokeSeat } from "@/lib/licences";

export async function resolveItemAction(clearanceId: string, itemId: string, status: "done" | "waived", _p: ActionState): Promise<ActionState> {
  return act("offboarding.manage", async (tx, actor) => {
    const [item] = await tx.select().from(clearanceItems).where(eq(clearanceItems.id, itemId));
    if (!item) throw new UserError("Item not found.");
    // "Done" on these runs the real action, so the record stays accurate.
    if (status === "done" && item.type === "account_revoke" && item.refId) await suspendAccount(tx, actor, item.refId);
    else if (status === "done" && item.type === "licence_reclaim" && item.refId) await revokeSeat(tx, actor, item.refId);
    else await resolveItemManually(tx, actor, itemId, status);
    return status === "done" ? "Done." : "Waived.";
  }, [`/app/offboarding/${clearanceId}`]);
}

export async function overrideAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("offboarding.manage", async (tx, actor, ctx) => {
    if (!ctx.hasRole("owner")) throw new UserError("Only an owner can release settlement with items still open.");
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason.length < 10) throw new UserError("Explain why (at least 10 characters). This goes on the audit trail.");
    await overrideClearance(tx, actor, id, reason);
    return "Final settlement released by override.";
  }, [`/app/offboarding/${id}`]);
}
