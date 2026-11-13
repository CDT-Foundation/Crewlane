import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  employees, jobGrades, letterTemplates, membershipRoles, memberships, orgUnits, roles, tenants, workflows,
} from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { audit } from "./audit";
import { UserError } from "./errors";
import { createLogin, deleteLogin } from "./auth";
import { isValidSlug } from "./hosts";
import { DEFAULT_LETTER_TEMPLATES } from "./letters";
import { markReleasesApplied, seedTenantDefaults } from "./seed";
import { isoDateFromNow } from "./utils";
import { TRIGGERS } from "./workflow-rules";

export type ProvisionInput = {
  orgName: string;
  slug: string;
  legalEntityName: string;
  country: string;
  currency: string;
  timezone: string;
  primaryColor: string;
  admin: { firstName: string; lastName: string; email: string; password: string; jobTitle: string };
};

export class ProvisionError extends UserError {}

/**
 * Creates a tenant with its default roles, org root, grades, letter
 * templates and workflows, plus the owner's login, employee record and
 * membership. Everything tenant-side is one transaction.
 */
export async function provisionTenant(input: ProvisionInput): Promise<{ tenantId: string; slug: string }> {
  const slug = input.slug.trim().toLowerCase();
  if (!isValidSlug(slug)) throw new ProvisionError("That address is not available.");

  const db = getDb();
  const [taken] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (taken) throw new ProvisionError("That address is already taken.");

  const userId = await createLogin({
    name: `${input.admin.firstName} ${input.admin.lastName}`.trim(),
    email: input.admin.email,
    password: input.admin.password,
  });

  const tenantId = randomUUID();
  try {
    await withTenant({ tenantId, userId }, async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        slug,
        name: input.orgName.trim(),
        country: input.country,
        currency: input.currency,
        timezone: input.timezone,
        branding: { primaryColor: input.primaryColor, letterheadName: input.legalEntityName.trim() },
      });

      await markReleasesApplied(tx, tenantId);
      await seedTenantDefaults(tx, tenantId);
      const roleRows = await tx.select({ id: roles.id, key: roles.key }).from(roles);

      const [root] = await tx
        .insert(orgUnits)
        .values({ tenantId, type: "legal_entity", name: input.legalEntityName.trim(), code: "HQ" })
        .returning({ id: orgUnits.id });

      const grades = await tx
        .insert(jobGrades)
        .values([
          { tenantId, code: "G1", name: "Associate", level: 1 },
          { tenantId, code: "G2", name: "Executive", level: 2 },
          { tenantId, code: "G3", name: "Senior executive", level: 3 },
          { tenantId, code: "G4", name: "Manager", level: 4 },
          { tenantId, code: "G5", name: "Senior manager", level: 5 },
          { tenantId, code: "G6", name: "Director", level: 6 },
        ])
        .returning({ id: jobGrades.id, code: jobGrades.code });

      await tx.insert(letterTemplates).values(DEFAULT_LETTER_TEMPLATES.map((t) => ({ tenantId, ...t })));

      await tx.insert(workflows).values(
        Object.entries(TRIGGERS).map(([trigger, spec]) => ({
          tenantId,
          trigger,
          name: spec.label,
          definition: spec.fallback,
        })),
      );

      const [emp] = await tx
        .insert(employees)
        .values({
          tenantId,
          employeeNo: "E0001",
          firstName: input.admin.firstName.trim(),
          lastName: input.admin.lastName.trim(),
          workEmail: input.admin.email.trim().toLowerCase(),
          jobTitle: input.admin.jobTitle.trim() || "Administrator",
          orgUnitId: root.id,
          jobGradeId: grades.find((g) => g.code === "G6")?.id,
          status: "active",
          hireDate: isoDateFromNow(0),
        })
        .returning({ id: employees.id });

      const [m] = await tx
        .insert(memberships)
        .values({ tenantId, userId, employeeId: emp.id })
        .returning({ id: memberships.id });

      const owner = roleRows.find((r) => r.key === "owner")!;
      await tx.insert(membershipRoles).values({ tenantId, membershipId: m.id, roleId: owner.id, scope: "company" });

      await audit(tx, { tenantId, userId }, {
        action: "tenant.created",
        entityType: "tenant",
        entityId: tenantId,
        after: { slug, name: input.orgName, country: input.country, currency: input.currency },
      });
    });
  } catch (err) {
    await deleteLogin(userId).catch(() => {});
    throw err;
  }
  return { tenantId, slug };
}
