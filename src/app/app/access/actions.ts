"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { membershipRoles, memberships, roles } from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { isPermission, SCOPES } from "@/lib/permissions";
import { type AppContext, requireAction, tenantTx } from "@/lib/session";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(60),
  description: z.string().trim().max(200),
});

function permissionsFrom(fd: FormData) {
  return fd.getAll("permissions").map(String).filter(isPermission);
}

/**
 * Anti-escalation: only owners can hand out the owner role, and nobody can
 * grant a permission they do not hold themselves.
 */
function assertCanGrant(ctx: AppContext, roleKey: string | null, permissions: string[]) {
  if (ctx.hasRole("owner")) return;
  if (roleKey === "owner") throw new UserError("Only an owner can grant the owner role.");
  const mine = new Set(ctx.grants.flatMap((g) => g.permissions));
  const extra = permissions.filter((p) => !mine.has(p));
  if (extra.length) throw new UserError(`You cannot grant permissions you do not have: ${extra.join(", ")}.`);
}

export async function createRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    const data = roleSchema.parse({ name: fd.get("name"), description: fd.get("description") ?? "" });
    const permissions = permissionsFrom(fd);
    if (permissions.length === 0) throw new UserError("Tick at least one permission.");
    assertCanGrant(ctx, null, permissions);
    const key = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    await tenantTx(ctx, async (tx) => {
      const [r] = await tx
        .insert(roles)
        .values({ tenantId: ctx.tenant.id, key, name: data.name, description: data.description || null, permissions })
        .returning({ id: roles.id });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "role.created", entityType: "role", entityId: r.id, after: { key, permissions },
      });
    });
    revalidatePath("/app/access");
    return `Role "${data.name}" created.`;
  });
}

export async function updateRolePermissionsAction(roleId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    const permissions = permissionsFrom(fd);
    await tenantTx(ctx, async (tx) => {
      const [before] = await tx.select().from(roles).where(eq(roles.id, roleId));
      if (!before) throw new UserError("Role not found.");
      if (before.key === "owner") throw new UserError("The owner role always has every permission.");
      assertCanGrant(ctx, before.key, permissions);
      await tx.update(roles).set({ permissions }).where(eq(roles.id, roleId));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "role.permissions_changed", entityType: "role", entityId: roleId,
        before: { permissions: before.permissions }, after: { permissions },
      });
    });
    revalidatePath("/app/access");
    return "Permissions updated.";
  });
}

export async function assignRoleAction(membershipId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    const roleId = z.uuid("Choose a role.").parse(fd.get("roleId"));
    const scope = z.enum(SCOPES).parse(fd.get("scope"));
    await tenantTx(ctx, async (tx) => {
      const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
      if (!m) throw new UserError("Member not found.");
      const [role] = await tx.select().from(roles).where(eq(roles.id, roleId));
      if (!role) throw new UserError("Role not found.");
      assertCanGrant(ctx, role.key, role.permissions);
      await tx
        .insert(membershipRoles)
        .values({ tenantId: ctx.tenant.id, membershipId, roleId, scope })
        .onConflictDoUpdate({ target: [membershipRoles.membershipId, membershipRoles.roleId], set: { scope } });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "access.role_assigned", entityType: "membership", entityId: membershipId, after: { roleId, scope },
      });
    });
    revalidatePath("/app/access");
    return "Role assigned.";
  });
}

export async function removeRoleAction(grantId: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("roles.manage");
    await tenantTx(ctx, async (tx) => {
      const [g] = await tx
        .select({ g: membershipRoles, key: roles.key })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(eq(membershipRoles.id, grantId));
      if (!g) throw new UserError("Not found.");
      if (g.key === "owner") {
        const owners = await tx
          .select({ id: membershipRoles.id })
          .from(membershipRoles)
          .where(and(eq(membershipRoles.roleId, g.g.roleId)));
        if (owners.length <= 1) throw new UserError("You cannot remove the last owner.");
      }
      await tx.delete(membershipRoles).where(eq(membershipRoles.id, grantId));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "access.role_removed", entityType: "membership", entityId: g.g.membershipId,
        before: { role: g.key, scope: g.g.scope },
      });
    });
    revalidatePath("/app/access");
    return "Removed.";
  });
}
