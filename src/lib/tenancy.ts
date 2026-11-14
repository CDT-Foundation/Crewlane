import { and, eq, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db/client";
import { memberships, tenantDomains, tenants } from "@/db/schema";
import { getAuth } from "./auth";
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

/** The tenant for the current request host, or resolved from user session on the root domain. */
export const currentTenant = cache(async (): Promise<Tenant | null> => {
  const host = await hostKind();
  const t = await findTenantForHost(host);
  if (t && t.status === "active") return t;

  // On the root domain, resolve the tenant from the authenticated user's active membership
  if (host.kind === "root") {
    try {
      const s = await getAuth().api.getSession({ headers: await headers() });
      if (s?.user?.id) {
        const db = getDb();
        const [row] = await db
          .select({ tenant: tenants })
          .from(memberships)
          .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
          .where(and(eq(memberships.userId, s.user.id), eq(memberships.active, true), eq(tenants.status, "active")))
          .limit(1);
        if (row?.tenant) return row.tenant;
      }
    } catch {
      return null;
    }
  }

  return null;
});

export function tenantUrl(slug: string, path = "/"): string {
  return tenantOrigin(slug, env.rootDomain, env.protocol) + path;
}
