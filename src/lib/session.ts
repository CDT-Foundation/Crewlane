import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { membershipRoles, memberships, roles } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { getAuth } from "./auth";
import { actingFor } from "./delegations";
import { UserError } from "./errors";
import { type Permission, type RoleGrant, type Scope, scopeFor } from "./permissions";
import { currentTenant, type Tenant } from "./tenancy";

export type AppContext = {
  tenant: Tenant;
  user: { id: string; name: string; email: string };
  membershipId: string;
  employeeId: string | null;
  grants: RoleGrant[];
  ip: string | null;
  /** Colleagues I am covering for today (leave-aware routing). */
  actingFor: { employeeIds: string[]; roleKeys: string[] };
  can: (p: Permission) => boolean;
  scope: (p: Permission) => Scope | null;
  hasRole: (key: string) => boolean;
};

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * Who is calling, in which tenant, with which roles. Null when there is no
 * tenant for this host, no session, or the user is not an active member.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const tenant = await currentTenant();
  if (!tenant) return null;
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s) return null;

  const { rows, acting } = await withTenant({ tenantId: tenant.id, userId: s.user.id }, async (tx) => {
    const rows = await tx
      .select({
        membershipId: memberships.id,
        employeeId: memberships.employeeId,
        active: memberships.active,
        roleKey: roles.key,
        permissions: roles.permissions,
        scope: membershipRoles.scope,
      })
      .from(memberships)
      .leftJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .leftJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(and(eq(memberships.userId, s.user.id)));
    const acting = await actingFor(tx, rows[0]?.employeeId ?? null);
    return { rows, acting };
  });
  const first = rows[0];
  if (!first || !first.active) return null;

  const grants: RoleGrant[] = rows
    .filter((r) => r.roleKey && r.scope)
    .map((r) => ({ key: r.roleKey!, permissions: r.permissions ?? [], scope: r.scope! }));

  return {
    tenant,
    user: { id: s.user.id, name: s.user.name, email: s.user.email },
    membershipId: first.membershipId,
    employeeId: first.employeeId,
    grants,
    ip: await clientIp(),
    actingFor: acting,
    can: (p) => scopeFor(grants, p) !== null,
    scope: (p) => scopeFor(grants, p),
    hasRole: (key) => grants.some((g) => g.key === key),
  };
});

/** For pages: redirects to sign-in, or 404s when the permission is missing. */
export async function requirePage(permission?: Permission): Promise<AppContext> {
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  if (permission && !ctx.can(permission)) notFound();
  return ctx;
}

export class ForbiddenError extends UserError {
  constructor(message = "You do not have permission to do that.") {
    super(message);
  }
}

/** For server actions: throws instead of redirecting. */
export async function requireAction(permission?: Permission): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) throw new ForbiddenError("Your session has expired. Sign in again.");
  if (permission && !ctx.can(permission)) throw new ForbiddenError();
  return ctx;
}

/** Shortcut: run a tenant-scoped transaction as the current user. */
export function tenantTx<T>(ctx: AppContext, fn: Parameters<typeof withTenant<T>>[1]) {
  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, fn);
}

/** Role keys and employee ids this user may approve as (own + acting-for). */
export function approverIdentity(ctx: AppContext) {
  return {
    roles: [...new Set([...ctx.grants.map((g) => g.key), ...ctx.actingFor.roleKeys])],
    employeeIds: [ctx.employeeId, ...ctx.actingFor.employeeIds].filter((x): x is string => Boolean(x)),
  };
}
