import { and, eq, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db/client";
import { tenantDomains, tenants } from "@/db/schema";
import { env } from "./env";
import { classifyHost, type HostKind, tenantOrigin } from "./hosts";

export type Tenant = typeof tenants.$inferSelect;

export async function requestHost(): Promise<string> {
  const h = await headers();
  // Prefer x-forwarded-host: it is what the ingress received, and Next.js
  // rewrites `host` to the bind address when it renders a server-action
  // redirect in the same request. Spoofing it gains nothing: membership is
  // always checked against the tenant it resolves to.
  const forwarded = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || h.get("host") || env.rootDomain;
}

export async function hostKind(): Promise<HostKind> {
  return classifyHost(await requestHost(), env.rootDomain);
}

export async function findTenantForHost(kind: HostKind): Promise<Tenant | null> {
  const db = getDb();
  if (kind.kind === "subdomain") {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, kind.slug)).limit(1);
    return t ?? null;
  }
  if (kind.kind === "custom") {
    const [row] = await db
      .select({ tenant: tenants })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
      .where(and(eq(tenantDomains.domain, kind.domain), isNotNull(tenantDomains.verifiedAt)))
      .limit(1);
    return row?.tenant ?? null;
  }
  return null;
}

/** The tenant for the current request host, or null on the root domain. */
export const currentTenant = cache(async (): Promise<Tenant | null> => {
  const t = await findTenantForHost(await hostKind());
  return t && t.status === "active" ? t : null;
});

export function tenantUrl(slug: string, path = "/"): string {
  return tenantOrigin(slug, env.rootDomain, env.protocol) + path;
}
