import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AmbientBackground, AuthArtwork } from "@/components/artwork";
import { BoltIcon, RocketIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { env } from "@/lib/env";
import { hostKind } from "@/lib/tenancy";
import { SignupWizard } from "./signup-wizard";

export const metadata = { title: "Create your organisation · Crewlane" };

export default async function SignupPage() {
  if ((await hostKind()).kind !== "root") redirect("/");
  if (!env.publicSignup) notFound();

  return (
    <div className="relative flex min-h-screen flex-col justify-between p-6 md:p-10">
      <AmbientBackground />

      {/* Top Header Navigation */}
      <header className="relative z-10 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand text-white shadow-md shadow-brand/20 transition-transform group-hover:scale-105">
            <BoltIcon size={18} />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Crewlane</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto my-auto grid w-full max-w-5xl gap-10 lg:grid-cols-12 lg:items-center">
        {/* Left column: Artwork (5 cols) */}
        <div className="hidden lg:col-span-5 lg:block">
          <AuthArtwork />
        </div>

        {/* Right column: Wizard (7 cols) */}
        <div className="lg:col-span-7">
          <div className="glass-panel mx-auto w-full max-w-xl rounded-3xl p-8 shadow-2xl transition-all sm:p-10">
            <div className="mb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 dark:bg-brand/20 px-3 py-1 text-xs font-semibold text-brand dark:text-cyan-300">
                <RocketIcon size={14} className="text-brand dark:text-cyan-400" />
                <span>Multi-Tenant Quick Setup</span>
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Create your organisation
              </h1>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
                Get started with automated hire-to-retire workflows, isolated RLS data vault, and private AI.
              </p>
            </div>

            <SignupWizard rootDomain={env.rootDomain} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-slate-400 dark:text-slate-500">
        © {new Date().getFullYear()} Crewlane OS · Sovereign Enterprise Workforce & IT Management
      </footer>
    </div>
  );
}
