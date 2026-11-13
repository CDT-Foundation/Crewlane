import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { tenantDomains } from "@/db/schema";
import { env } from "@/lib/env";
import { stripPort } from "@/lib/hosts";
import { requirePage, tenantTx } from "@/lib/session";
import { addDomainAction, removeDomainAction, saveBrandingAction, verifyDomainAction } from "./actions";

export default async function SettingsPage() {
  const ctx = await requirePage("settings.manage");
  const domains = await tenantTx(ctx, (tx) =>
    tx.select().from(tenantDomains).where(eq(tenantDomains.tenantId, ctx.tenant.id)),
  );
  const t = ctx.tenant;
  const b = t.branding;

  return (
    <>
      <PageHeader title="Settings" description={`${t.slug}.${env.rootDomain} · ${t.country} · ${t.currency} · ${t.timezone}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Branding">
          <ActionForm action={saveBrandingAction} submitLabel="Save branding">
            <Field label="Organisation name"><Input name="name" defaultValue={t.name} required /></Field>
            <Field label="Brand colour"><Input name="primaryColor" type="color" defaultValue={b.primaryColor ?? "#1e3a5f"} className="h-10 w-20 p-1" /></Field>
            <Field label="Logo URL" hint="An https:// link to a PNG or SVG. File upload arrives with object storage in Phase 2.">
              <Input name="logoUrl" type="url" defaultValue={b.logoUrl ?? ""} placeholder="https://" />
            </Field>
            <Field label="Letterhead name"><Input name="letterheadName" defaultValue={b.letterheadName ?? ""} /></Field>
            <Field label="Letterhead address"><Textarea name="letterheadAddress" defaultValue={b.letterheadAddress ?? ""} rows={3} /></Field>
          </ActionForm>
        </Card>

        <Card title="Custom domains">
          <p className="mb-4 text-sm text-slate-600">
            Serve Crewlane from your own domain, for example <span className="font-mono">hr.yourcompany.com</span>.
          </p>
          <ul className="mb-4 space-y-4">
            {domains.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{d.domain}</span>
                  {d.verifiedAt ? <Badge tone="green">verified</Badge> : <Badge tone="amber">pending</Badge>}
                  <div className="ml-auto flex gap-2">
                    {!d.verifiedAt ? <ActionForm action={verifyDomainAction.bind(null, d.id)} submitLabel="Verify" variant="secondary" inline /> : null}
                    <ActionForm action={removeDomainAction.bind(null, d.id)} submitLabel="Remove" variant="ghost" inline confirm={`Remove ${d.domain}?`} />
                  </div>
                </div>
                {!d.verifiedAt ? (
                  <dl className="mt-3 grid gap-1 text-xs text-slate-600">
                    <dt className="font-medium">1. TXT record</dt>
                    <dd className="font-mono">_crewlane.{d.domain} → {d.verificationToken}</dd>
                    <dt className="mt-2 font-medium">2. CNAME record</dt>
                    <dd className="font-mono">{d.domain} → {t.slug}.{stripPort(env.rootDomain)}</dd>
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
          <ActionForm action={addDomainAction} submitLabel="Add domain" variant="secondary" resetOnSuccess inline>
            <Input name="domain" placeholder="hr.yourcompany.com" required className="w-64" />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
