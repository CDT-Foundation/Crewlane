import { revalidatePath } from "next/cache";
import type { Tx } from "@/db/client";
import { type ActionState, run } from "./actions";
import type { Actor } from "./audit";
import type { Permission } from "./permissions";
import { type AppContext, requireAction, tenantTx } from "./session";

/**
 * Server-action helper: checks the permission, runs `fn` in a tenant
 * transaction as the current user, revalidates paths and returns a message.
 */
export async function act(
  permission: Permission | null,
  fn: (tx: Tx, actor: Actor & { userId: string }, ctx: AppContext) => Promise<string | void>,
  revalidate: string[] = [],
): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction(permission ?? undefined);
    const msg = await tenantTx(ctx, (tx) => fn(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, ctx));
    for (const p of revalidate) revalidatePath(p);
    return msg ?? "Saved.";
  });
}
