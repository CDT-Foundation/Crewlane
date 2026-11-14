import { redirect } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AmbientBackground, AuthArtwork } from "@/components/artwork";
import { BoltIcon, SparklesIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Field, Input } from "@/components/ui";
import { getAppContext } from "@/lib/session";
import { currentTenant } from "@/lib/tenancy";
import { signInAction } from "../auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  if (await getAppContext()) redirect("/app");
  const tenant = await currentTenant();
  const { welcome } = await searchParams;

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
      <main className="relative z-10 mx-auto my-auto grid w-full max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
        {/* Left: Auth Artwork */}
        <AuthArtwork />

        {/* Right: Glass Sign In Card */}
        <div className="glass-panel mx-auto w-full max-w-md rounded-3xl p-8 shadow-2xl transition-all sm:p-10">
          <div className="mb-6 flex items-center gap-3">
            {tenant ? (
              tenant.branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.branding.logoUrl} alt="" className="h-10 w-auto" />
              ) : (
                <div className="grid size-11 place-items-center rounded-2xl bg-brand text-xl font-bold text-white shadow-md shadow-brand/25">
                  {tenant.name.charAt(0)}
                </div>
              )
            ) : (
              <div className="flex size-11 items-center justify-center rounded-2xl bg-brand text-white shadow-md shadow-brand/25">
                <BoltIcon size={22} />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Sign in</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tenant ? `to ${tenant.name}` : "Access your workspace"}
              </p>
            </div>
          </div>

          {welcome ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 backdrop-blur-md">
              <SparklesIcon size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <strong className="font-semibold">Organisation created!</strong>
                <p className="mt-0.5 opacity-90">Sign in with the administrator account you just created.</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            <ActionForm action={signInAction} submitLabel="Sign in to workspace">
              <Field label="Work Email">
                <Input name="email" type="email" autoComplete="username" placeholder="name@company.com" required />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" required />
              </Field>
            </ActionForm>
          </div>

          <div className="mt-8 border-t border-slate-100 dark:border-white/5 pt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            Powered by Crewlane Multi-Tenant Architecture · AES-256
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-slate-400 dark:text-slate-500">
        © {new Date().getFullYear()} Crewlane OS. All rights reserved.
      </footer>
    </div>
  );
}
