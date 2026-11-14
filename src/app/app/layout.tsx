import type { ReactNode } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notifications } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { pendingForMe } from "@/lib/queries";
import { initials } from "@/lib/utils";
import { signOutAction } from "../auth-actions";
import { Toaster } from "@/components/toaster";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/artwork";
import {
  DashboardIcon,
  UsersIcon,
  CheckCircleIcon,
  TicketIcon,
  LaptopIcon,
  PlaneIcon,
  BoxIcon,
  ShoppingCartIcon,
  DoorIcon,
  QrScanIcon,
  KeyIcon,
  DocumentTextIcon,
  SmartphoneIcon,
  LockIcon,
  CreditCardIcon,
  BuildingIcon,
  MailIcon,
  BoltIcon,
  ShieldCheckIcon,
  ScrollIcon,
  PlugIcon,
  SettingsIcon,
  ClockIcon,
  CpuIcon,
} from "@/components/icons";
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
        { href: "/app", label: "Overview", icon: <DashboardIcon size={16} /> },
        ...(c("employees.read") ? [{ href: "/app/employees", label: "People Directory", icon: <UsersIcon size={16} /> }] : []),
        { href: "/app/approvals", label: "Approvals", icon: <CheckCircleIcon size={16} />, badge: pending.length },
        { href: "/app/helpdesk", label: c("helpdesk.agent") ? "Service Desk" : "IT Support", icon: <TicketIcon size={16} /> },
        { href: "/app/assets/requests", label: "Equipment Requests", icon: <LaptopIcon size={16} /> },
        { href: "/app/delegations", label: "Out of Office", icon: <PlaneIcon size={16} /> },
      ],
    },
    {
      label: "IT & EAM Assets",
      items: [
        ...(c("assets.read") ? [{ href: "/app/assets", label: "Asset Register", icon: <BoxIcon size={16} /> }] : []),
        ...(c("procurement.manage") ? [{ href: "/app/procurement", label: "Procurement", icon: <ShoppingCartIcon size={16} /> }] : []),
        ...(c("gatepass.manage") ? [{ href: "/app/gate-passes", label: "Gate Passes", icon: <DoorIcon size={16} /> }] : []),
        ...(c("gatepass.scan") || c("gatepass.manage") ? [{ href: "/app/gate", label: "Gate Scanner", icon: <QrScanIcon size={16} /> }] : []),
        ...(c("identity.manage") ? [{ href: "/app/identity", label: "IAM & Accounts", icon: <KeyIcon size={16} /> }] : []),
        ...(c("licences.manage") ? [{ href: "/app/licences", label: "Software Licences", icon: <DocumentTextIcon size={16} /> }] : []),
        ...(c("telecom.manage") ? [{ href: "/app/telecom", label: "Telecom & SIMs", icon: <SmartphoneIcon size={16} /> }] : []),
        ...(c("offboarding.manage")
          ? [
              { href: "/app/offboarding", label: "Exit Clearance", icon: <LockIcon size={16} /> },
              { href: "/app/deductions", label: "Payroll Deductions", icon: <CreditCardIcon size={16} /> },
            ]
          : []),
      ],
    },
    {
      label: "Enterprise & Governance",
      items: [
        ...(c("org.manage") ? [{ href: "/app/org", label: "Org Structure", icon: <BuildingIcon size={16} /> }] : []),
        ...(c("letters.manage") ? [{ href: "/app/letters", label: "Digital Letters", icon: <MailIcon size={16} /> }] : []),
        ...(c("workflows.manage") ? [{ href: "/app/workflows", label: "Approval Workflows", icon: <BoltIcon size={16} /> }] : []),
        ...(c("roles.manage") ? [{ href: "/app/access", label: "Roles & RBAC", icon: <ShieldCheckIcon size={16} /> }] : []),
        ...(c("audit.read") ? [{ href: "/app/audit", label: "Immutable Audit Log", icon: <ScrollIcon size={16} /> }] : []),
        ...(c("integrations.manage") ? [{ href: "/app/settings/integrations", label: "Integrations", icon: <PlugIcon size={16} /> }] : []),
        ...(c("settings.manage") ? [{ href: "/app/settings", label: "Tenant Settings", icon: <SettingsIcon size={16} /> }] : []),
      ],
    },
    {
      label: "Coming Next",
      items: [
        { href: "/app/modules/payroll", label: "Time & Payroll", icon: <ClockIcon size={16} />, soon: "Ph 3" },
        { href: "/app/modules/ownmind", label: "Ownmind Local AI", icon: <CpuIcon size={16} />, soon: "Ph 4" },
      ],
    },
  ].filter((g) => g.items.length > 0);

  const brandLogo = ctx.tenant.branding.logoUrl;

  return (
    <div className="relative flex min-h-screen">
      <AmbientBackground />

      {/* Desktop Frosted Glass Sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl px-4 py-5 md:flex shadow-sm z-20">
        {/* Brand / Tenant Header */}
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt="" className="h-8 w-auto rounded-lg" />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold text-white shadow-md shadow-brand/25">
                {ctx.tenant.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                {ctx.tenant.name}
              </span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                {ctx.tenant.slug}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href="/app/notifications"
              className="relative rounded-xl p-1.5 text-slate-500 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-white/5 transition-colors"
              aria-label={`${unread} unread notifications`}
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread ? (
                <span className="absolute top-1 right-1 flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                </span>
              ) : null}
            </Link>
            <ThemeToggle />
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto pr-1">
          <Nav groups={groups} />
        </div>

        {/* User Card in Sidebar Footer */}
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 p-2.5 backdrop-blur-md">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand/20 to-indigo-500/20 text-xs font-bold text-brand dark:text-cyan-300 border border-brand/20">
            {initials(ctx.user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{ctx.user.name}</p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              {ctx.grants.map((g) => g.key).join(", ") || "Member"}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Mobile Header Bar */}
        <header className="no-print flex items-center justify-between border-b border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl px-4 py-3 md:hidden z-10">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-xs font-bold text-white">
              {ctx.tenant.name.charAt(0)}
            </span>
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{ctx.tenant.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/notifications"
              className="relative rounded-lg p-1.5 text-slate-600 dark:text-slate-300"
              aria-label={`${unread} notifications`}
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unread ? <span className="ml-0.5 text-xs text-rose-500 font-bold">{unread}</span> : null}
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
