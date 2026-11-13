import type { ReactNode } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notifications } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { pendingForMe } from "@/lib/queries";
import { initials } from "@/lib/utils";
import { signOutAction } from "../auth-actions";
import { Toaster } from "@/components/toaster";
import { Nav, type NavGroup } from "./nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePage();
  const { pending, unread } = await tenantTx(ctx, async (tx) => ({
    pending: await pendingForMe(tx, ctx),
    unread: (
      await tx
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)))
    )[0].n,
  }));
  const c = ctx.can;

  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { href: "/app", label: "Overview" },
        ...(c("employees.read") ? [{ href: "/app/employees", label: "People" }] : []),
        { href: "/app/approvals", label: "Approvals", badge: pending.length },
        { href: "/app/helpdesk", label: c("helpdesk.agent") ? "Service desk" : "IT support" },
        { href: "/app/assets/requests", label: "Equipment requests" },
        { href: "/app/delegations", label: "Out of office" },
      ],
    },
    {
      label: "IT and assets",
      items: [
        ...(c("assets.read") ? [{ href: "/app/assets", label: "Asset register" }] : []),
        ...(c("procurement.manage") ? [{ href: "/app/procurement", label: "Procurement" }] : []),
        ...(c("gatepass.manage") ? [{ href: "/app/gate-passes", label: "Gate passes" }] : []),
        ...(c("gatepass.scan") || c("gatepass.manage") ? [{ href: "/app/gate", label: "Gate scan" }] : []),
        ...(c("identity.manage") ? [{ href: "/app/identity", label: "Accounts" }] : []),
        ...(c("licences.manage") ? [{ href: "/app/licences", label: "Licences" }] : []),
        ...(c("telecom.manage") ? [{ href: "/app/telecom", label: "Telecom" }] : []),
        ...(c("offboarding.manage") ? [{ href: "/app/offboarding", label: "Exit clearance" }, { href: "/app/deductions", label: "Payroll deductions" }] : []),
      ],
    },
    {
      label: "Organisation",
      items: [
        ...(c("org.manage") ? [{ href: "/app/org", label: "Structure and grades" }] : []),
        ...(c("letters.manage") ? [{ href: "/app/letters", label: "Letter templates" }] : []),
        ...(c("workflows.manage") ? [{ href: "/app/workflows", label: "Workflows" }] : []),
        ...(c("roles.manage") ? [{ href: "/app/access", label: "Roles and access" }] : []),
        ...(c("audit.read") ? [{ href: "/app/audit", label: "Audit trail" }] : []),
        ...(c("integrations.manage") ? [{ href: "/app/settings/integrations", label: "Integrations" }] : []),
        ...(c("settings.manage") ? [{ href: "/app/settings", label: "Settings" }] : []),
      ],
    },
    {
      label: "Coming next",
      items: [
        { href: "/app/modules/payroll", label: "Time and payroll", soon: "Ph 3" },
        { href: "/app/modules/ownmind", label: "Ownmind AI", soon: "Ph 4" },
      ],
    },
  ].filter((g) => g.items.length > 0);

  const brandLogo = ctx.tenant.branding.logoUrl;

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          {brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogo} alt="" className="h-7 w-auto" />
          ) : (
            <span className="grid size-7 place-items-center rounded-md bg-brand text-sm font-semibold text-white">
              {ctx.tenant.name.charAt(0)}
            </span>
          )}
          <span className="truncate text-sm font-semibold">{ctx.tenant.name}</span>
          <Link
            href="/app/notifications"
            className="ml-auto rounded-md px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
            aria-label={`${unread} unread notifications`}
          >
            🔔{unread ? <span className="ml-0.5 rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread}</span> : null}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav groups={groups} />
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 px-3 pt-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initials(ctx.user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{ctx.user.name}</p>
            <p className="truncate text-xs text-slate-500">{ctx.grants.map((g) => g.key).join(", ") || "no role"}</p>
          </div>
          <form action={signOutAction}>
            <button className="text-xs text-slate-500 hover:text-slate-900" title="Sign out">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
      <Toaster />
    </div>
  );
}
