"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { softwareSubscriptions, vendorInvoices } from "@/db/schema";
import { act } from "@/lib/act";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { assignSeat, revokeSeat } from "@/lib/licences";
import { objectKey, putFile } from "@/lib/storage";

const subSchema = z.object({
  product: z.string().trim().min(2, "Enter the product.").max(120),
  plan: z.string().trim().max(120),
  vendorId: z.string().transform((v) => (v === "" ? null : v)),
  billingCycle: z.enum(["monthly", "annual"]),
  seatsTotal: z.coerce.number().int().min(1, "At least one seat.").max(100000),
  costPerSeat: z.string().refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter the price per seat."),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the renewal date."),
  autoRenew: z.string().optional().transform((v) => v === "on"),
  costUnitId: z.string().transform((v) => (v === "" ? null : v)),
  ownerEmployeeId: z.string().transform((v) => (v === "" ? null : v)),
  notes: z.string().trim().max(1000),
});

export async function saveSubscriptionAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  let newId = "";
  const res = await act("licences.manage", async (tx, actor, ctx) => {
    const d = subSchema.parse(Object.fromEntries(fd));
    if (id) {
      const [before] = await tx.select().from(softwareSubscriptions).where(eq(softwareSubscriptions.id, id));
      if (!before) throw new UserError("Not found.");
      // A new renewal date restarts the 30/14/7-day reminders.
      const resetReminders = before.renewalDate !== d.renewalDate ? { remindersSent: [] as number[] } : {};
      await tx.update(softwareSubscriptions).set({ ...d, plan: d.plan || null, notes: d.notes || null, ...resetReminders }).where(eq(softwareSubscriptions.id, id));
      await audit(tx, actor, { action: "subscription.updated", entityType: "software_subscription", entityId: id, after: { seats: d.seatsTotal, renewal: d.renewalDate } });
      return "Saved.";
    }
    const [s] = await tx
      .insert(softwareSubscriptions)
      .values({ tenantId: actor.tenantId, ...d, plan: d.plan || null, notes: d.notes || null, currency: ctx.tenant.currency })
      .returning({ id: softwareSubscriptions.id });
    newId = s.id;
    await audit(tx, actor, { action: "subscription.created", entityType: "software_subscription", entityId: s.id, after: { product: d.product } });
  }, ["/app/licences"]);
  if (res?.error || id) return res;
  redirect(`/app/licences/${newId}`);
}

export async function assignSeatAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("licences.manage", async (tx, actor) => {
    await assignSeat(tx, actor, id, z.uuid("Choose a person.").parse(fd.get("employeeId")));
    return "Seat assigned.";
  }, [`/app/licences/${id}`]);
}

export async function revokeSeatAction(subId: string, assignmentId: string, _p: ActionState): Promise<ActionState> {
  return act("licences.manage", async (tx, actor) => {
    await revokeSeat(tx, actor, assignmentId);
    return "Seat reclaimed.";
  }, [`/app/licences/${subId}`]);
}

export async function uploadInvoiceAction(subId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return act("licences.manage", async (tx, actor, ctx) => {
    const [sub] = await tx.select().from(softwareSubscriptions).where(eq(softwareSubscriptions.id, subId));
    if (!sub) throw new UserError("Not found.");
    const d = z
      .object({
        invoiceNo: z.string().trim().min(1, "Enter the invoice number.").max(60),
        amount: z.string().refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter the amount."),
        issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the invoice date."),
        dueOn: z.string().transform((v) => (v === "" ? null : v)),
      })
      .parse(Object.fromEntries(fd));
    const file = fd.get("file");
    let fileKey: string | null = null;
    let fileName: string | null = null;
    if (file instanceof File && file.size > 0) {
      fileKey = objectKey(ctx.tenant.id, "invoices", file.name);
      fileName = file.name;
      await putFile(fileKey, file);
    }
    const [inv] = await tx
      .insert(vendorInvoices)
      .values({
        tenantId: actor.tenantId, vendorId: sub.vendorId, subscriptionId: sub.id, invoiceNo: d.invoiceNo, amount: d.amount,
        currency: sub.currency, issuedOn: d.issuedOn, dueOn: d.dueOn, costUnitId: sub.costUnitId, fileKey, fileName, createdBy: actor.userId,
      })
      .returning({ id: vendorInvoices.id });
    await audit(tx, actor, { action: "invoice.added", entityType: "vendor_invoice", entityId: inv.id, after: { invoiceNo: d.invoiceNo, amount: d.amount } });
    return "Invoice saved.";
  }, [`/app/licences/${subId}`]);
}
