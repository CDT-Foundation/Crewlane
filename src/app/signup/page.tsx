import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/env";
import { hostKind } from "@/lib/tenancy";
import { SignupWizard } from "./signup-wizard";

export const metadata = { title: "Create your organisation · Crewlane" };

export default async function SignupPage() {
  if ((await hostKind()).kind !== "root") redirect("/");
  if (!env.publicSignup) notFound();
  return (
    <main className="mx-auto max-w-lg px-6 py-14">
      <h1 className="text-2xl font-semibold">Create your organisation</h1>
      <p className="mt-1 text-sm text-slate-600">
        You become the owner. We set up default roles, job grades, letter templates and approval workflows you can change later.
      </p>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <SignupWizard rootDomain={env.rootDomain} />
      </div>
    </main>
  );
}
