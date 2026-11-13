import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { membershipRoles, memberships, notifications, roles, user } from "@/db/schema";
import { emit } from "./audit";
import type { Permission } from "./permissions";

type Note = { kind: string; title: string; body?: string; href?: string; email?: boolean };

/** In-app notification, plus an email queued through the outbox. */
export async function notifyUsers(tx: Tx, tenantId: string, userIds: string[], note: Note) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await tx.insert(notifications).values(
    ids.map((userId) => ({ tenantId, userId, kind: note.kind, title: note.title, body: note.body, href: note.href })),
  );
  if (note.email !== false) {
    const recipients = await tx.select({ email: user.email }).from(user).where(inArray(user.id, ids));
    if (recipients.length) {
      await emit(tx, tenantId, "email.send", {
        to: recipients.map((r) => r.email),
        subject: note.title,
        text: [note.body ?? "", note.href ? `\nOpen: ${note.href}` : ""].join(""),
      });
    }
  }
}

export async function userIdsForEmployees(tx: Tx, employeeIds: (string | null | undefined)[]) {
  const ids = employeeIds.filter((x): x is string => Boolean(x));
  if (!ids.length) return [];
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(inArray(memberships.employeeId, ids), eq(memberships.active, true)));
  return rows.map((r) => r.userId);
}

export async function userIdsWithPermission(tx: Tx, permission: Permission) {
  const rows = await tx
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.active, true), sql`${permission} = any(${roles.permissions})`));
  return rows.map((r) => r.userId);
}

export async function notifyEmployees(tx: Tx, tenantId: string, employeeIds: (string | null | undefined)[], note: Note) {
  await notifyUsers(tx, tenantId, await userIdsForEmployees(tx, employeeIds), note);
}

export async function notifyPermission(tx: Tx, tenantId: string, permission: Permission, note: Note) {
  await notifyUsers(tx, tenantId, await userIdsWithPermission(tx, permission), note);
}

export async function userIdsWithRole(tx: Tx, roleKey: string) {
  const rows = await tx
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.active, true), eq(roles.key, roleKey)));
  return rows.map((r) => r.userId);
}
