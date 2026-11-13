"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { assetCategories, employees } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { createAssetRequest } from "@/lib/asset-requests";
import { UserError } from "@/lib/errors";

export async function createRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await act(null, async (tx, actor, ctx) => {
    const forId = String(fd.get("forEmployeeId") || ctx.employeeId || "");
    if (!forId) throw new UserError("Your login is not linked to an employee record.");
    if (forId !== ctx.employeeId) {
      // Managers can request for their reports; asset managers for anyone.
      const [e] = await tx.select().from(employees).where(eq(employees.id, forId));
      const allowed = ctx.can("assets.manage") || e?.managerId === ctx.employeeId;
      if (!e || !allowed) throw new UserError("You can request equipment for yourself or your direct reports.");
    }
    const cats = await tx.select().from(assetCategories);
    const lines = [0, 1, 2, 3]
      .map((i) => ({
        categoryId: String(fd.get(`cat_${i}`) ?? ""),
        description: String(fd.get(`desc_${i}`) ?? "").trim(),
        quantity: Number(fd.get(`qty_${i}`) || 0),
        estimatedUnitCost: Number(fd.get(`cost_${i}`) || 0),
      }))
      .filter((l) => l.categoryId && l.quantity > 0)
      .map((l) => ({ ...l, description: l.description || cats.find((c) => c.id === l.categoryId)?.name || "Item" }));
    const req = await createAssetRequest(tx, actor, {
      forEmployeeId: forId,
      reason: String(fd.get("reason") ?? "").trim() || null,
      source: forId === ctx.employeeId ? "self_service" : "manager",
      lines,
    });
    id = req.id;
  });
  if (res?.error) return res;
  redirect(`/app/assets/requests/${id}`);
}
