/**
 * Idempotent per-tenant defaults. Used when a tenant is created and, after
 * every migration, to bring existing tenants up to the current release
 * (new system roles, permissions, categories, SLA policies). Never overwrites
 * a tenant's own customisations.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Tx } from "@/db/client";
import { assetCategories, roles, slaPolicies, tenantCounters, tenants } from "@/db/schema";
import type * as schema from "@/db/schema";
import { ALL_PERMISSIONS, RELEASE_PERMISSION_GRANTS, SYSTEM_ROLES } from "./permissions";

export const DEFAULT_ASSET_CATEGORIES = [
  { code: "LAP", name: "Laptops", method: "straight_line" as const, usefulLifeMonths: 36, wdvRate: "33.33", itManaged: true },
  { code: "DSK", name: "Desktops", method: "straight_line" as const, usefulLifeMonths: 48, wdvRate: "25", itManaged: true },
  { code: "MON", name: "Monitors", method: "straight_line" as const, usefulLifeMonths: 60, wdvRate: "20", itManaged: true },
  { code: "PHN", name: "Mobile phones", method: "straight_line" as const, usefulLifeMonths: 24, wdvRate: "50", itManaged: true },
  { code: "NET", name: "Network equipment", method: "straight_line" as const, usefulLifeMonths: 60, wdvRate: "20", itManaged: true },
  { code: "FUR", name: "Furniture", method: "written_down_value" as const, usefulLifeMonths: 120, wdvRate: "10", itManaged: false },
  { code: "VEH", name: "Vehicles", method: "written_down_value" as const, usefulLifeMonths: 96, wdvRate: "20", itManaged: false },
  { code: "MCH", name: "Machinery", method: "written_down_value" as const, usefulLifeMonths: 120, wdvRate: "15", itManaged: false },
];

export const DEFAULT_SLA = [
  { priority: "p1" as const, responseMinutes: 30, resolveMinutes: 4 * 60 },
  { priority: "p2" as const, responseMinutes: 60, resolveMinutes: 8 * 60 },
  { priority: "p3" as const, responseMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  { priority: "p4" as const, responseMinutes: 8 * 60, resolveMinutes: 72 * 60 },
];

type AnyTx = Tx | PostgresJsDatabase<typeof schema>;

export async function seedTenantDefaults(tx: AnyTx, tenantId: string) {
  await tx
    .insert(roles)
    .values(
      SYSTEM_ROLES.map((r) => ({
        tenantId, key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: true,
      })),
    )
    .onConflictDoNothing({ target: [roles.tenantId, roles.key] });

  // The owner always holds every permission, including new ones.
  await tx
    .update(roles)
    .set({ permissions: ALL_PERMISSIONS })
    .where(and(eq(roles.tenantId, tenantId), eq(roles.key, "owner")));

  // One-time permission grants per release, so later edits by the tenant stick.
  for (const [release, grants] of Object.entries(RELEASE_PERMISSION_GRANTS)) {
    const key = `release:${release}`;
    const [done] = await tx
      .select()
      .from(tenantCounters)
      .where(and(eq(tenantCounters.tenantId, tenantId), eq(tenantCounters.key, key)));
    if (done) continue;
    for (const [roleKey, perms] of Object.entries(grants)) {
      await tx
        .update(roles)
        .set({
          permissions: sql`(select array(select distinct unnest(${roles.permissions} || array[${sql.join(perms.map((p) => sql`${p}`), sql`, `)}]::text[])))`,
        })
        .where(and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)));
    }
    await tx.insert(tenantCounters).values({ tenantId, key, value: 1 }).onConflictDoNothing();
  }

  await tx
    .insert(assetCategories)
    .values(DEFAULT_ASSET_CATEGORIES.map((c) => ({ tenantId, ...c })))
    .onConflictDoNothing({ target: [assetCategories.tenantId, assetCategories.code] });

  await tx
    .insert(slaPolicies)
    .values(DEFAULT_SLA.map((p) => ({ tenantId, ...p })))
    .onConflictDoNothing({ target: [slaPolicies.tenantId, slaPolicies.priority] });
}

/** Marks every release as already applied (used for brand-new tenants). */
export async function markReleasesApplied(tx: AnyTx, tenantId: string) {
  for (const release of Object.keys(RELEASE_PERMISSION_GRANTS)) {
    await tx.insert(tenantCounters).values({ tenantId, key: `release:${release}`, value: 1 }).onConflictDoNothing();
  }
}

/** Runs seedTenantDefaults for every tenant, each in its own tenant context. */
export async function upgradeAllTenants(db: PostgresJsDatabase<typeof schema>) {
  const rows = await db.select({ id: tenants.id }).from(tenants);
  for (const t of rows) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${t.id}, true)`);
      await seedTenantDefaults(tx, t.id);
    });
  }
  return rows.length;
}
