import { redirect } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AmbientBackground } from "@/components/artwork";
import { BoltIcon, CpuIcon, DoorIcon, LaptopIcon, UsersIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input, LinkButton } from "@/components/ui";
import { env } from "@/lib/env";
import { currentTenant, hostKind } from "@/lib/tenancy";
import { findOrganisationAction } from "./auth-actions";

const PILLARS = [
  {
    title: "Digital HR & Payroll",
    text: "Employee master graph, digital offer letters, leaves, shifts and statutory tax calculations.",
    icon: UsersIcon,
    tag: "Core HCM",
  },
  {
    title: "IT Service & Assets",
    text: "Asset inventory with QR labels, depreciation, Kanban helpdesk, and Google/M365 provisioning.",
    icon: LaptopIcon,
    tag: "EAM & ITSM",
  },
  {
    title: "Enterprise & Industrial",
    text: "Zero-touch onboarding, exit clearance gate, security QR gate passes, kiosks and telecom billing.",
    icon: DoorIcon,
    tag: "Governance",
  },
  {
    title: "Ownmind In-House AI",
    text: "Private local AI on your own servers. Salaries and passport IDs never leave your sovereign vault.",
    icon: CpuIcon,
    tag: "100% Private",
  },
];

export default async function Home() {
  const kind = await hostKind();
  if (kind.kind !== "root") {
    const tenant = await currentTenant();
    if (tenant) redirect("/app");
    return (
      <main className="relative grid min-h-screen place-items-center p-8 text-center">
        <AmbientBackground />
        <div className="glass-panel mx-auto max-w-md rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Organisation not found</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">There is no active Crewlane organisation at this address.</p>
          <a className="mt-5 inline-block text-sm font-semibold text-brand dark:text-cyan-400 underline" href={env.rootUrl}>
            Go to Crewlane Home →
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />

      {/* Glass Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20 transition-transform group-hover:scale-105">
              <BoltIcon size={18} />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Crewlane</span>
          </Link>

          <div className="flex items-center gap-4">
            {env.publicSignup ? (
              <LinkButton href="/signup" variant="primary" className="text-xs">
                Create Organisation
              </LinkButton>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24 animate-fade-in">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 dark:border-cyan-400/30 bg-brand/10 dark:bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-brand dark:text-cyan-300 backdrop-blur-md">
          <span className="size-2 rounded-full bg-brand dark:bg-cyan-400 animate-pulse" />
          Sovereign Workforce, Payroll & IT OS
        </div>

        <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-3xl leading-[1.15]">
          One platform for your people, their equipment and the rules that connect them.
        </h1>

        <p className="mt-5 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
          When HR hires someone, IT is triggered to provision accounts and laptops. When someone resigns, final
          settlement waits until every asset is securely returned. Zero-cloud AI, 100% data privacy.
        </p>

        {/* Action Controls */}
        <div className="mt-10 flex flex-wrap items-center gap-5">
          {env.publicSignup ? (
            <LinkButton href="/signup" className="text-sm font-semibold shadow-xl">
              Create your organisation →
            </LinkButton>
          ) : null}

          {/* Quick Find Org Glass Card */}
          <div className="glass-card rounded-2xl p-3 border border-slate-200/80 dark:border-white/10 shadow-lg">
            <ActionForm action={findOrganisationAction} submitLabel="Go to sign in" variant="secondary" inline>
              <div className="flex items-center rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 px-3 py-1 text-sm backdrop-blur-md">
                <Input
                  name="slug"
                  placeholder="your-company"
                  className="border-0 bg-transparent shadow-none focus:ring-0 px-1 py-1 text-xs sm:text-sm text-slate-900 dark:text-white"
                  required
                  aria-label="Organisation address"
                />
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">.{env.rootDomain}</span>
              </div>
            </ActionForm>
          </div>
        </div>

        {/* 4 Pillars Glass Grid */}
        <div className="mt-20 grid gap-5 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="glass-panel group relative overflow-hidden rounded-2xl p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 dark:bg-cyan-500/15 text-brand dark:text-cyan-300">
                  <p.icon size={20} />
                </div>
                <span className="rounded-full border border-slate-200/60 dark:border-white/10 bg-slate-100/70 dark:bg-slate-800/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {p.tag}
                </span>
              </div>
              <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white group-hover:text-brand dark:group-hover:text-cyan-400 transition-colors">
                {p.title}
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 dark:border-white/10 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
        © {new Date().getFullYear()} Crewlane OS. Enterprise Workforce, Payroll & Asset Management.
      </footer>
    </div>
  );
}
