"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { employees, preboardingInvites } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { type ActionState, run } from "@/lib/actions";
import { audit, emit } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto";
import { UserError } from "@/lib/errors";
import { currentTenant } from "@/lib/tenancy";

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  personalEmail: z.email("Enter a valid personal email."),
  phone: text(40).min(7, "Enter your phone number."),
  address: text(500).min(5, "Enter your address."),
  emergencyContact: text(200).min(3, "Enter an emergency contact."),
  nationalId: text(20).min(5, "Enter your NIC number."),
  passportNo: text(20),
  passportExpiry: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date."),
  bankName: text(120).min(2, "Enter your bank and branch."),
  bankAccount: z.string().trim().regex(/^[0-9 -]{6,30}$/, "Enter a valid account number."),
});

export async function submitPreboardingAction(token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const tenant = await currentTenant();
    if (!tenant) throw new UserError("This link is not valid.");
    const d = schema.parse(Object.fromEntries(fd));
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await withTenant({ tenantId: tenant.id }, async (tx) => {
      const [inv] = await tx
        .select()
        .from(preboardingInvites)
        .where(
          and(
            eq(preboardingInvites.tokenHash, sha256Hex(token)),
            isNull(preboardingInvites.submittedAt),
            gt(preboardingInvites.expiresAt, new Date()),
          ),
        )
        .for("update");
      if (!inv) throw new UserError("This link has expired or was already used. Ask HR for a new one.");
      const [emp] = await tx.select().from(employees).where(eq(employees.id, inv.employeeId));
      if (!emp || emp.status !== "preboarding") throw new UserError("This link is no longer active.");

      await tx
        .update(employees)
        .set({
          personalEmail: d.personalEmail.toLowerCase(),
          phone: d.phone,
          address: d.address,
          emergencyContact: d.emergencyContact,
          nationalId: d.nationalId,
          passportNo: d.passportNo || null,
          passportExpiry: d.passportExpiry || null,
          // First capture only. Later changes go through maker-checker.
          ...(emp.bankAccount ? {} : { bankName: d.bankName, bankAccount: d.bankAccount.replace(/[\s-]/g, "") }),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, emp.id));
      await tx.update(preboardingInvites).set({ submittedAt: new Date() }).where(eq(preboardingInvites.id, inv.id));
      await audit(tx, { tenantId: tenant.id, userId: null, ip }, {
        action: "preboarding.submitted", entityType: "employee", entityId: emp.id,
        after: { fields: Object.keys(d).filter((k) => k !== "bankAccount" && k !== "nationalId") },
      });
      await emit(tx, tenant.id, "preboarding.submitted", { employeeId: emp.id });
    });
    return "Thank you. Your details have been sent to HR.";
  });
}
