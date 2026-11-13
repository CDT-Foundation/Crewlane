import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, payrollDeductions, telecomBills, telecomLines } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { resolveClearanceItemsFor } from "./clearance";
import { UserError } from "./errors";

export type BillRow = { number: string; amount: number };

/** Splits one CSV line into fields, honouring double quotes ("4,250.50"). */
export function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parses "number,amount" CSV text (header and blank lines are skipped). */
export function parseBillCsv(text: string): BillRow[] {
  const rows: BillRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const [num, amt] = csvFields(raw);
    if (!num || !/\d{6,}/.test(num.replace(/\D/g, "")) || amt === undefined) continue;
    const amount = Number(amt.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(amount) || amt.replace(/[^0-9.]/g, "") === "") continue;
    rows.push({ number: num.replace(/\s+/g, ""), amount });
  }
  return rows;
}

/**
 * Splits each bill into allowance and personal excess. Excess is held for
 * review; finance then raises a payroll deduction or waives it.
 */
export async function importBills(tx: Tx, actor: Actor, period: string, rows: BillRow[]) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new UserError("Choose the billing month.");
  const lines = await tx.select().from(telecomLines);
  const byNumber = new Map(lines.map((l) => [l.number.replace(/\s+/g, ""), l]));
  let imported = 0;
  const unknown: string[] = [];
  for (const r of rows) {
    const line = byNumber.get(r.number);
    if (!line) {
      unknown.push(r.number);
      continue;
    }
    const allowance = Number(line.monthlyAllowance);
    const excess = Math.max(0, Math.round((r.amount - allowance) * 100) / 100);
    await tx
      .insert(telecomBills)
      .values({
        tenantId: actor.tenantId, lineId: line.id, period, amount: r.amount.toFixed(2), allowance: allowance.toFixed(2),
        excess: excess.toFixed(2), status: excess > 0 && line.employeeId ? "pending_review" : "within_allowance",
      })
      .onConflictDoNothing({ target: [telecomBills.tenantId, telecomBills.lineId, telecomBills.period] });
    imported++;
  }
  await audit(tx, actor, { action: "telecom.bills_imported", entityType: "telecom", entityId: period, after: { imported, unknown } });
  return { imported, unknown };
}

export async function decideExcess(tx: Tx, actor: Actor, billId: string, decision: "deduct" | "waive", currency: string) {
  const [b] = await tx.select().from(telecomBills).where(eq(telecomBills.id, billId)).for("update");
  if (!b || b.status !== "pending_review") throw new UserError("This bill is not waiting for review.");
  if (decision === "waive") {
    await tx.update(telecomBills).set({ status: "waived" }).where(eq(telecomBills.id, billId));
  } else {
    const [line] = await tx.select().from(telecomLines).where(eq(telecomLines.id, b.lineId));
    if (!line?.employeeId) throw new UserError("This line has no employee to charge.");
    const [d] = await tx
      .insert(payrollDeductions)
      .values({
        tenantId: actor.tenantId, employeeId: line.employeeId, source: "telecom_excess", reference: `${line.number} ${b.period}`,
        description: `Personal mobile usage above allowance (${b.period})`, amount: b.excess, currency, createdBy: actor.userId,
      })
      .returning({ id: payrollDeductions.id });
    await tx.update(telecomBills).set({ status: "deduction_raised", deductionId: d.id }).where(eq(telecomBills.id, billId));
  }
  await audit(tx, actor, { action: `telecom.excess_${decision}`, entityType: "telecom_bill", entityId: billId, after: { excess: b.excess } });
}

export async function reassignLine(tx: Tx, actor: Actor, lineId: string, employeeId: string | null) {
  const [line] = await tx.select().from(telecomLines).where(eq(telecomLines.id, lineId));
  if (!line) throw new UserError("Line not found.");
  if (employeeId) {
    const [e] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
    if (!e) throw new UserError("Employee not found.");
  }
  await tx.update(telecomLines).set({ employeeId }).where(and(eq(telecomLines.id, lineId)));
  await audit(tx, actor, { action: "telecom.line_reassigned", entityType: "telecom_line", entityId: lineId, before: { employeeId: line.employeeId }, after: { employeeId } });
  if (line.employeeId && line.employeeId !== employeeId) await resolveClearanceItemsFor(tx, actor, "telecom_line", lineId, "done");
}
