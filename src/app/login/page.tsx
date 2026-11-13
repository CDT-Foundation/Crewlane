import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { getAppContext } from "@/lib/session";
import { currentTenant } from "@/lib/tenancy";
import { signInAction } from "../auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  if (await getAppContext()) redirect("/app");
  const { welcome } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8">
        {tenant.branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.branding.logoUrl} alt="" className="mb-4 h-10 w-auto" />
        ) : (
          <div className="mb-4 grid size-10 place-items-center rounded-lg bg-brand text-lg font-semibold text-white">
            {tenant.name.charAt(0)}
          </div>
        )}
        <h1 className="text-lg font-semibold">Sign in to {tenant.name}</h1>
        {welcome ? (
          <p className="mt-2 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">
            Your organisation is ready. Sign in with the account you just created.
          </p>
        ) : null}
        <div className="mt-6">
          <ActionForm action={signInAction} submitLabel="Sign in">
            <Field label="Work email">
              <Input name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
