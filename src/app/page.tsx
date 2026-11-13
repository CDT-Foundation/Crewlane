import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Input, LinkButton } from "@/components/ui";
import { env } from "@/lib/env";
import { currentTenant, hostKind } from "@/lib/tenancy";
import { findOrganisationAction } from "./auth-actions";

const PILLARS = [
  ["Digital HR and payroll", "Records, letters, attendance, leave and statutory payroll for Sri Lanka and beyond."],
  ["IT service and assets", "Asset inventory, helpdesk with SLA timers and Google / Microsoft 365 provisioning."],
  ["Enterprise and industrial", "Zero-touch onboarding and offboarding, gate passes, factory kiosks and HSE."],
  ["Ownmind local AI", "A private AI engine on your own servers. Salaries and IDs never leave your vault."],
];

export default async function Home() {
  const kind = await hostKind();
  if (kind.kind !== "root") {
    const tenant = await currentTenant();
    if (tenant) redirect("/app");
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Organisation not found</h1>
          <p className="mt-2 text-slate-600">There is no active Crewlane organisation at this address.</p>
          <a className="mt-4 inline-block text-sm text-brand underline" href={env.rootUrl}>Go to Crewlane</a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-500">Crewlane</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900">
        One platform for your people, their equipment and the rules that connect them.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        When HR hires someone, IT is asked to prepare their laptop. When someone resigns, final pay waits until
        every asset is back. Multi-tenant, with private in-house AI.
      </p>
      <div className="mt-8 flex flex-wrap items-start gap-6">
        {env.publicSignup ? <LinkButton href="/signup">Create your organisation</LinkButton> : null}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Already on Crewlane?</p>
          <ActionForm action={findOrganisationAction} submitLabel="Go to sign in" variant="secondary" inline>
            <div className="flex items-center rounded-md border border-slate-300 bg-white pr-3 text-sm">
              <Input name="slug" placeholder="your-company" className="border-0 shadow-none focus:ring-0" required aria-label="Organisation address" />
              <span className="text-slate-500">.{env.rootDomain}</span>
            </div>
          </ActionForm>
        </div>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {PILLARS.map(([title, text]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
