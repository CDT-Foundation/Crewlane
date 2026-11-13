"use server";

import { z } from "zod";
import { telecomLines } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { decideExcess, importBills, parseBillCsv, reassignLine } from "@/lib/telecom";

export async function addLineAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("telecom.manage", async (tx, actor) => {
    const d = z
      .object({
        number: z.string().trim().regex(/^[0-9+ ]{7,20}$/, "Enter the mobile number."),
        carrier: z.string().trim().min(2, "Enter the carrier.").max(60),
        plan: z.string().trim().max(80),
        employeeId: z.string().transform((v) => (v === "" ? null : v)),
        monthlyAllowance: z.string().refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter the monthly allowance."),
      })
      .parse(Object.fromEntries(fd));
    const [l] = await tx
      .insert(telecomLines)
      .values({ tenantId: actor.tenantId, ...d, number: d.number.replace(/\s+/g, ""), plan: d.plan || null })
      .returning({ id: telecomLines.id });
    await audit(tx, actor, { action: "telecom.line_added", entityType: "telecom_line", entityId: l.id, after: d });
    return "Line added.";
  }, ["/app/telecom"]);
}

export async function reassignLineAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("telecom.manage", async (tx, actor) => {
    const e = String(fd.get("employeeId") ?? "");
    await reassignLine(tx, actor, id, e || null);
    return "Updated.";
  }, ["/app/telecom"]);
}

export async function importBillsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return act("telecom.manage", async (tx, actor) => {
    const period = String(fd.get("period") ?? "");
    let text = String(fd.get("csv") ?? "");
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 2_000_000) throw new UserError("The CSV must be under 2 MB.");
      text = await file.text();
    }
    const rows = parseBillCsv(text);
    if (rows.length === 0) throw new UserError("No rows found. Use: number,amount");
    const r = await importBills(tx, actor, period, rows);
    return `${r.imported} bill(s) imported.${r.unknown.length ? ` Unknown numbers: ${r.unknown.join(", ")}` : ""}`;
  }, ["/app/telecom"]);
}

export async function decideAction(billId: string, decision: "deduct" | "waive", _p: ActionState): Promise<ActionState> {
  return act("telecom.manage", async (tx, actor, ctx) => {
    await decideExcess(tx, actor, billId, decision, ctx.tenant.currency);
    return decision === "deduct" ? "Payroll deduction raised." : "Waived.";
  }, ["/app/telecom"]);
}
