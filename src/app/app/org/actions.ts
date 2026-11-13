"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jobGrades, orgUnits, orgUnitType } from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { requireAction, tenantTx } from "@/lib/session";

const unitSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  code: z.string().trim().max(20).transform((v) => (v === "" ? null : v.toUpperCase())),
  type: z.enum(orgUnitType.enumValues),
  parentId: z.string().transform((v) => (v === "" ? null : v)).pipe(z.uuid().nullable()),
});

export async function addUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("org.manage");
    const data = unitSchema.parse(Object.fromEntries(fd));
    if (data.type !== "legal_entity" && !data.parentId) throw new UserError("Choose where this unit sits.");
    await tenantTx(ctx, async (tx) => {
      const [u] = await tx.insert(orgUnits).values({ tenantId: ctx.tenant.id, ...data }).returning({ id: orgUnits.id });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "org_unit.created", entityType: "org_unit", entityId: u.id, after: data,
      });
    });
    revalidatePath("/app/org");
    return `${data.name} added.`;
  });
}

export async function renameUnitAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("org.manage");
    const name = z.string().trim().min(2, "Enter a name.").max(120).parse(fd.get("name"));
    await tenantTx(ctx, async (tx) => {
      const [before] = await tx.select().from(orgUnits).where(eq(orgUnits.id, id));
      if (!before) throw new UserError("Unit not found.");
      await tx.update(orgUnits).set({ name }).where(eq(orgUnits.id, id));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "org_unit.renamed", entityType: "org_unit", entityId: id, before: { name: before.name }, after: { name },
      });
    });
    revalidatePath("/app/org");
    return "Renamed.";
  });
}

export async function deleteUnitAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("org.manage");
    await tenantTx(ctx, async (tx) => {
      const [before] = await tx.select().from(orgUnits).where(eq(orgUnits.id, id));
      if (!before) throw new UserError("Unit not found.");
      const [child] = await tx.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, id)).limit(1);
      if (child) throw new UserError("Move or delete the units inside it first.");
      await tx.delete(orgUnits).where(eq(orgUnits.id, id));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "org_unit.deleted", entityType: "org_unit", entityId: id, before: { name: before.name, type: before.type },
      });
    });
    revalidatePath("/app/org");
    return "Deleted. People in it are now unassigned.";
  });
}

const gradeSchema = z.object({
  code: z.string().trim().min(1, "Enter a code.").max(12).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, "Enter a name.").max(80),
  level: z.coerce.number().int().min(1).max(50),
});

export async function addGradeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("org.manage");
    const data = gradeSchema.parse(Object.fromEntries(fd));
    await tenantTx(ctx, async (tx) => {
      const [g] = await tx.insert(jobGrades).values({ tenantId: ctx.tenant.id, ...data }).returning({ id: jobGrades.id });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "job_grade.created", entityType: "job_grade", entityId: g.id, after: data,
      });
    });
    revalidatePath("/app/org");
    return `Grade ${data.code} added.`;
  });
}

export async function deleteGradeAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("org.manage");
    await tenantTx(ctx, async (tx) => {
      const [g] = await tx.delete(jobGrades).where(eq(jobGrades.id, id)).returning();
      if (!g) throw new UserError("Grade not found.");
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "job_grade.deleted", entityType: "job_grade", entityId: id, before: { code: g.code, name: g.name },
      });
    });
    revalidatePath("/app/org");
    return "Grade deleted.";
  });
}
