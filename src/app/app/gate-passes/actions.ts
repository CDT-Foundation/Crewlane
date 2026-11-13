"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { cancelGatePass, issueGatePass, scanGatePass } from "@/lib/gatepass";
import { ForbiddenError } from "@/lib/session";

const schema = z.object({
  type: z.enum(["returnable", "non_returnable"]),
  assetId: z.string().transform((v) => (v === "" ? null : v)),
  description: z.string().trim().min(3, "Describe what is leaving.").max(300),
  carrierName: z.string().trim().min(2, "Who is carrying it?").max(120),
  carrierEmployeeId: z.string().transform((v) => (v === "" ? null : v)),
  destination: z.string().trim().min(2, "Where is it going?").max(200),
  reason: z.string().trim().max(300),
  expectedReturnOn: z.string().transform((v) => (v === "" ? null : v)),
});

export async function issuePassAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await act("gatepass.manage", async (tx, actor) => {
    const d = schema.parse(Object.fromEntries(fd));
    const { pass, token } = await issueGatePass(tx, actor, { ...d, reason: d.reason || null });
    target = `/app/gate-passes/${pass.id}?t=${encodeURIComponent(token)}`;
  });
  if (res?.error) return res;
  redirect(target);
}

export async function cancelPassAction(id: string, _p: ActionState): Promise<ActionState> {
  return act("gatepass.manage", async (tx, actor) => {
    await cancelGatePass(tx, actor, id);
    return "Cancelled.";
  }, [`/app/gate-passes/${id}`]);
}

export async function scanAction(id: string, direction: "out" | "in", _p: ActionState): Promise<ActionState> {
  const res = await act(null, async (tx, actor, ctx) => {
    if (!ctx.can("gatepass.scan") && !ctx.can("gatepass.manage")) throw new ForbiddenError();
    await scanGatePass(tx, actor, id, direction);
    return direction === "out" ? "Recorded leaving. Let it through." : "Recorded back on site.";
  }, ["/app/gate"]);
  return res;
}
