"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  employees, jobGrades, letterTemplates, letters, membershipRoles, memberships, orgUnits, preboardingInvites, roles,
} from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit, diff, emit } from "@/lib/audit";
import { createLogin, getAuth } from "@/lib/auth";
import { newToken, sha256Hex } from "@/lib/crypto";
import { canSeeEmployee, fullName, nextEmployeeNo } from "@/lib/employees";
import { UserError } from "@/lib/errors";
import { formatDate, LETTER_PLACEHOLDERS, renderTemplate } from "@/lib/letters";
import { type Scope, SCOPES } from "@/lib/permissions";
import { type AppContext, requireAction, tenantTx } from "@/lib/session";
import { tenantUrl } from "@/lib/tenancy";
import { startApproval } from "@/lib/workflows";

const optionalText = z.string().trim().max(200).transform((v) => (v === "" ? null : v));
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.");
const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || z.uuid().safeParse(v).success, "Invalid selection.");

const coreFields = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80),
  workEmail: z.union([z.literal(""), z.email("Enter a valid work email.")]).transform((v) => (v === "" ? null : v.toLowerCase())),
  personalEmail: z.union([z.literal(""), z.email("Enter a valid personal email.")]).transform((v) => (v === "" ? null : v.toLowerCase())),
  phone: optionalText,
  jobTitle: optionalText,
  orgUnitId: optionalUuid,
  jobGradeId: optionalUuid,
  managerId: optionalUuid,
  dottedManagerId: optionalUuid,
  employmentType: z.enum(["permanent", "contract", "intern", "casual"]),
  hireDate: optionalDate,
});

const sensitiveFields = z.object({
  nationalId: optionalText,
  passportNo: optionalText,
  passportExpiry: optionalDate,
  visaExpiry: optionalDate,
  address: z.string().trim().max(500).transform((v) => (v === "" ? null : v)),
  emergencyContact: optionalText,
});

function pick(fd: FormData, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = String(fd.get(k) ?? "");
  return out;
}

async function assertWritable(ctx: AppContext, employeeId: string) {
  const scope = ctx.scope("employees.write");
  if (!scope) throw new UserError("You cannot edit employee records.");
  const ok = await tenantTx(ctx, (tx) => canSeeEmployee(tx, scope, ctx.employeeId, employeeId));
  if (!ok) throw new UserError("Employee not found.");
}

export async function createEmployeeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const ctx = await requireAction("employees.write");
    const data = coreFields.parse(pick(fd, Object.keys(coreFields.shape)));
    const status = fd.get("status") === "active" ? "active" : fd.get("status") === "probation" ? "probation" : "preboarding";
    id = await tenantTx(ctx, async (tx) => {
      const employeeNo = await nextEmployeeNo(tx, ctx.tenant.id);
      const [row] = await tx
        .insert(employees)
        .values({ tenantId: ctx.tenant.id, employeeNo, status, ...data })
        .returning({ id: employees.id });
      const actor = { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip };
      await audit(tx, actor, { action: "employee.created", entityType: "employee", entityId: row.id, after: { employeeNo, status, ...data } });
      // Phase 2 listens for this to raise the IT provisioning ticket.
      await emit(tx, ctx.tenant.id, "employee.hired", { employeeId: row.id, employeeNo, status, hireDate: data.hireDate });
      return row.id;
    });
  });
  if (res?.error) return res;
  redirect(`/app/employees/${id}`);
}

export async function updateEmployeeAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("employees.write");
    await assertWritable(ctx, id);
    const data: Record<string, unknown> = coreFields.parse(pick(fd, Object.keys(coreFields.shape)));
    if (ctx.can("employees.sensitive")) {
      Object.assign(data, sensitiveFields.parse(pick(fd, Object.keys(sensitiveFields.shape))));
    }
    const status = fd.get("status");
    if (status === "preboarding" || status === "probation" || status === "active") data.status = status;
    if (data.managerId === id || data.dottedManagerId === id) throw new UserError("An employee cannot report to themselves.");

    await tenantTx(ctx, async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).for("update");
      if (!before) throw new UserError("Employee not found.");
      if ((before.status === "resigned" || before.status === "terminated") && data.status) delete data.status;
      const d = diff(before as Record<string, unknown>, data);
      if (!d.changed) return;
      await tx.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, id));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "employee.updated", entityType: "employee", entityId: id, before: d.before, after: d.after,
      });
      if (before.status !== "active" && data.status === "active") {
        await emit(tx, ctx.tenant.id, "employee.activated", { employeeId: id });
      }
    });
    revalidatePath(`/app/employees/${id}`);
    return "Saved.";
  });
}

const bankSchema = z.object({
  bankName: z.string().trim().min(2, "Enter the bank and branch.").max(120),
  bankAccount: z.string().trim().regex(/^[0-9 -]{6,30}$/, "Enter a valid account number."),
});

export async function requestBankChangeAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction();
    const own = ctx.employeeId === id;
    if (!own) await assertWritable(ctx, id);
    const data = bankSchema.parse({ bankName: fd.get("bankName"), bankAccount: fd.get("bankAccount") });
    const result = await tenantTx(ctx, async (tx) => {
      const [emp] = await tx.select().from(employees).where(eq(employees.id, id));
      if (!emp) throw new UserError("Employee not found.");
      return startApproval(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        trigger: "employee.bank_change",
        title: `Bank account change for ${fullName(emp)} (${emp.employeeNo})`,
        subjectType: "employee",
        subjectId: id,
        payload: { ...data, bankAccount: data.bankAccount.replace(/[\s-]/g, "") },
      });
    });
    revalidatePath(`/app/employees/${id}`);
    return result.status === "pending"
      ? "Request raised. A second officer must approve it before payroll uses the new account."
      : "Bank details updated.";
  });
}

const exitSchema = z.object({
  status: z.enum(["resigned", "terminated"]),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last working day."),
  reason: z.string().trim().max(500),
});

export async function requestExitAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("employees.write");
    await assertWritable(ctx, id);
    const data = exitSchema.parse({ status: fd.get("status"), exitDate: fd.get("exitDate"), reason: fd.get("reason") });
    await tenantTx(ctx, async (tx) => {
      const [emp] = await tx.select().from(employees).where(eq(employees.id, id));
      if (!emp) throw new UserError("Employee not found.");
      if (emp.status === "resigned" || emp.status === "terminated") throw new UserError("This employee has already left.");
      await startApproval(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        trigger: "employee.status_change",
        title: `${data.status === "resigned" ? "Resignation" : "Termination"} of ${fullName(emp)} (${emp.employeeNo})`,
        subjectType: "employee",
        subjectId: id,
        payload: data,
      });
    });
    revalidatePath(`/app/employees/${id}`);
    return "Sent for approval.";
  });
}

export async function createPreboardingInviteAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("preboarding.manage");
    await assertWritable(ctx, id);
    const { token, hash } = newToken();
    await tenantTx(ctx, async (tx) => {
      const [emp] = await tx.select().from(employees).where(eq(employees.id, id));
      if (!emp) throw new UserError("Employee not found.");
      if (emp.status !== "preboarding") throw new UserError("Pre-boarding links are only for new hires in pre-boarding.");
      const [inv] = await tx
        .insert(preboardingInvites)
        .values({
          tenantId: ctx.tenant.id,
          employeeId: id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 14 * 864e5),
          createdBy: ctx.user.id,
        })
        .returning({ id: preboardingInvites.id });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "preboarding.invited", entityType: "employee", entityId: id, after: { inviteId: inv.id },
      });
    });
    revalidatePath(`/app/employees/${id}`);
    return `Share this link with the candidate (valid 14 days, shown once): ${tenantUrl(ctx.tenant.slug, `/preboarding/${token}`)}`;
  });
}

export async function issueLetterAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  let letterId = "";
  const res = await run(async () => {
    const ctx = await requireAction("letters.issue");
    await assertWritable(ctx, id).catch(async () => {
      // Letters can be issued by anyone with letters.issue who can see the employee.
      const scope = ctx.scope("employees.read");
      const ok = scope && (await tenantTx(ctx, (tx) => canSeeEmployee(tx, scope, ctx.employeeId, id)));
      if (!ok) throw new UserError("Employee not found.");
    });
    const templateId = z.uuid("Choose a template.").parse(fd.get("templateId"));
    letterId = await tenantTx(ctx, async (tx) => {
      const [tpl] = await tx.select().from(letterTemplates).where(eq(letterTemplates.id, templateId));
      if (!tpl) throw new UserError("Template not found.");
      const [row] = await tx
        .select({ e: employees, unit: orgUnits.name, grade: jobGrades.name })
        .from(employees)
        .leftJoin(orgUnits, eq(orgUnits.id, employees.orgUnitId))
        .leftJoin(jobGrades, eq(jobGrades.id, employees.jobGradeId))
        .where(eq(employees.id, id));
      if (!row) throw new UserError("Employee not found.");
      const tz = ctx.tenant.timezone;
      const { text, missing } = renderTemplate(tpl.body, {
        "employee.fullName": fullName(row.e),
        "employee.firstName": row.e.firstName,
        "employee.employeeNo": row.e.employeeNo,
        "employee.jobTitle": row.e.jobTitle,
        "employee.department": row.unit,
        "employee.grade": row.grade,
        "employee.hireDate": formatDate(row.e.hireDate, tz),
        "tenant.name": ctx.tenant.branding.letterheadName || ctx.tenant.name,
        today: formatDate(new Date(), tz),
        "issuer.name": ctx.user.name,
      });
      if (missing.length) {
        const labels = missing.map((k) => LETTER_PLACEHOLDERS[k] ?? k).join(", ");
        throw new UserError(`Fill in the employee's ${labels.toLowerCase()} before issuing this letter.`);
      }
      const issuedAt = new Date();
      const signatureHash = sha256Hex([ctx.tenant.id, id, text, ctx.user.id, issuedAt.toISOString()].join("|"));
      const [letter] = await tx
        .insert(letters)
        .values({
          tenantId: ctx.tenant.id, employeeId: id, templateId, title: tpl.name, body: text,
          signatureHash, issuedBy: ctx.user.id, issuedAt,
        })
        .returning({ id: letters.id });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "letter.issued", entityType: "letter", entityId: letter.id,
        after: { employeeId: id, template: tpl.key, signatureHash },
      });
      return letter.id;
    });
  });
  if (res?.error) return res;
  redirect(`/app/letters/issued/${letterId}`);
}

const accessSchema = z.object({
  email: z.email("Enter the email they will sign in with."),
  password: z.string().max(128),
  roleKey: z.string().min(1),
  scope: z.enum(SCOPES),
});

export async function grantAccessAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    const data = accessSchema.parse(Object.fromEntries(fd));
    const email = data.email.toLowerCase();
    const authCtx = await getAuth().$context;
    const existing = await authCtx.internalAdapter.findUserByEmail(email);

    const emp = await tenantTx(ctx, async (tx) => {
      const [e] = await tx.select().from(employees).where(eq(employees.id, id));
      if (!e) throw new UserError("Employee not found.");
      const [linked] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.employeeId, id));
      if (linked) throw new UserError("This employee already has portal access.");
      const [role] = await tx.select().from(roles).where(eq(roles.key, data.roleKey));
      if (!role) throw new UserError("Choose a role.");
      if (!ctx.hasRole("owner")) {
        const mine = new Set(ctx.grants.flatMap((g) => g.permissions));
        if (role.key === "owner" || role.permissions.some((p) => !mine.has(p))) {
          throw new UserError("You cannot grant a role with more access than you have.");
        }
      }
      if (existing) {
        const [m] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, existing.user.id));
        if (m) throw new UserError("That email already belongs to another member of this organisation.");
      }
      return e;
    });

    let userId = existing?.user.id;
    let created = false;
    if (!userId) {
      if (data.password.length < 10) throw new UserError("Set a temporary password of at least 10 characters.");
      userId = await createLogin({ name: fullName(emp), email, password: data.password });
      created = true;
    }

    await tenantTx(ctx, async (tx) => {
      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, data.roleKey));
      const [m] = await tx
        .insert(memberships)
        .values({ tenantId: ctx.tenant.id, userId: userId!, employeeId: id })
        .returning({ id: memberships.id });
      await tx.insert(membershipRoles).values({ tenantId: ctx.tenant.id, membershipId: m.id, roleId: role!.id, scope: data.scope as Scope });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "access.granted", entityType: "membership", entityId: m.id,
        after: { employeeId: id, email, role: data.roleKey, scope: data.scope, newLogin: created },
      });
    });
    revalidatePath(`/app/employees/${id}`);
    return created
      ? `Access granted. Share the temporary password with ${email} securely and ask them to change it.`
      : `Access granted. ${email} can sign in with their existing Crewlane password.`;
  });
}

export async function revokeAccessAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    await tenantTx(ctx, async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.employeeId, id));
      if (!m) throw new UserError("No portal access to revoke.");
      if (m.userId === ctx.user.id) throw new UserError("You cannot revoke your own access.");
      const owners = await tx
        .select({ membershipId: membershipRoles.membershipId })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(eq(roles.key, "owner"));
      if (owners.length === 1 && owners[0].membershipId === m.id) {
        throw new UserError("You cannot remove the last owner.");
      }
      // Removing the membership (and its role grants) locks them out of this
      // tenant at once; their login may still belong to other tenants.
      await tx.delete(memberships).where(and(eq(memberships.id, m.id)));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "access.revoked", entityType: "membership", entityId: m.id,
      });
    });
    revalidatePath(`/app/employees/${id}`);
    return "Access revoked.";
  });
}
