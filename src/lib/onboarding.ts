/**
 * Zero-touch onboarding. When HR adds a hire (event employee.hired), IT gets
 * an onboarding ticket, accounts are queued in Google Workspace / Microsoft
 * 365, and the equipment kit for the hire's grade is allocated from stock.
 */
import { eq, isNull, or } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, equipmentKits, identityAccounts, orgUnits, tickets } from "@/db/schema";
import { createAssetRequest } from "./asset-requests";
import { emit, type Actor } from "./audit";
import { createTicket } from "./helpdesk";
import { loadIntegration } from "./integrations";
import { formatDate } from "./letters";

export function suggestEmail(firstName: string, lastName: string, domain: string) {
  const clean = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return `${clean(firstName)}.${clean(lastName)}@${domain.toLowerCase()}`;
}

export async function onEmployeeHired(tx: Tx, tenantId: string, employeeId: string) {
  const ref = `onboarding:${employeeId}`;
  const [already] = await tx.select({ id: tickets.id }).from(tickets).where(eq(tickets.externalRef, ref));
  if (already) return;
  const [e] = await tx
    .select({ e: employees, unit: orgUnits.name })
    .from(employees)
    .leftJoin(orgUnits, eq(orgUnits.id, employees.orgUnitId))
    .where(eq(employees.id, employeeId));
  if (!e) return;
  const emp = e.e;
  const actor: Actor = { tenantId, userId: null };

  const accounts: string[] = [];
  for (const provider of ["google_workspace", "microsoft_365"] as const) {
    const cfg = await loadIntegration(tx, tenantId, provider);
    if (!cfg?.enabled) continue;
    const domain = cfg.config.domain || "example.com";
    const email = emp.workEmail && emp.workEmail.endsWith(`@${domain}`) ? emp.workEmail : suggestEmail(emp.firstName, emp.lastName, domain);
    const groups = (cfg.config.defaultGroups ?? "").split(",").map((g) => g.trim()).filter(Boolean);
    const [acc] = await tx
      .insert(identityAccounts)
      .values({ tenantId, employeeId, provider, email, groups })
      .onConflictDoNothing()
      .returning({ id: identityAccounts.id });
    if (acc) {
      accounts.push(`${provider === "google_workspace" ? "Google" : "Microsoft 365"}: ${email}`);
      await emit(tx, tenantId, "identity.provision", { accountId: acc.id });
    }
  }

  const [kit] = await tx
    .select()
    .from(equipmentKits)
    .where(emp.jobGradeId ? or(eq(equipmentKits.jobGradeId, emp.jobGradeId), isNull(equipmentKits.jobGradeId)) : isNull(equipmentKits.jobGradeId))
    .orderBy(equipmentKits.jobGradeId) // grade-specific kit first (nulls last)
    .limit(1);
  let kitLine = "No equipment kit is set for this grade.";
  if (kit && kit.items.length) {
    const req = await createAssetRequest(tx, actor, {
      forEmployeeId: employeeId,
      reason: `Day-1 equipment kit: ${kit.name}`,
      source: "onboarding",
      lines: kit.items.map((i) => ({ categoryId: i.categoryId, description: i.description, quantity: i.quantity, estimatedUnitCost: 0 })),
    });
    kitLine = `Equipment request ${req.number} (${kit.name}).`;
  }

  await createTicket(tx, actor, {
    title: `Onboarding: ${emp.firstName} ${emp.lastName}${emp.hireDate ? ` starts ${formatDate(emp.hireDate)}` : ""}`,
    description: [
      `New hire ${emp.employeeNo} ${emp.firstName} ${emp.lastName}, ${emp.jobTitle ?? "no title"}${e.unit ? `, ${e.unit}` : ""}.`,
      "",
      accounts.length ? `Accounts being created:\n- ${accounts.join("\n- ")}` : "No identity integration is enabled: create email and system accounts manually.",
      "",
      kitLine,
      "",
      "Checklist: hand over equipment with signature, confirm sign-in works, add to team channels, Day-1 training.",
    ].join("\n"),
    category: "onboarding",
    priority: "p2",
    channel: "system",
    requesterEmployeeId: employeeId,
    externalRef: ref,
  });
}
