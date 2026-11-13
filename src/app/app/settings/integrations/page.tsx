import { desc } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { agentTokens, softwareBlocklist, tenantIntegrations } from "@/db/schema";
import { PROVIDERS, type Provider } from "@/lib/integrations";
import { requirePage, tenantTx } from "@/lib/session";
import { tenantUrl } from "@/lib/tenancy";
import { formatDateTime } from "@/lib/utils";
import { addBlockAction, createAgentTokenAction, removeBlockAction, revokeAgentTokenAction, saveIntegrationAction } from "./actions";

const CONFIGURABLE: Provider[] = ["google_workspace", "microsoft_365", "smtp", "inbound_webhook"];

export default async function IntegrationsPage() {
  const ctx = await requirePage("integrations.manage");
  const data = await tenantTx(ctx, async (tx) => ({
    rows: await tx.select().from(tenantIntegrations),
    tokens: await tx.select().from(agentTokens).orderBy(desc(agentTokens.createdAt)),
    blocks: await tx.select().from(softwareBlocklist),
  }));
  const base = tenantUrl(ctx.tenant.slug, "");

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Each integration runs in simulator mode (no outside calls, for setup and testing) or live mode with real credentials. Secrets are encrypted at rest and never shown again."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {CONFIGURABLE.map((p) => {
          const spec = PROVIDERS[p];
          const row = data.rows.find((r) => r.provider === p);
          return (
            <Card key={p} title={<span className="flex items-center gap-2">{spec.label} {row ? <Badge tone={row.enabled ? (row.mode === "live" ? "green" : "blue") : "gray"}>{row.enabled ? row.mode : "off"}</Badge> : <Badge>not set up</Badge>}</span>}>
              <p className="mb-4 text-xs text-slate-500">{spec.help}</p>
              {p === "inbound_webhook" ? (
                <p className="mb-4 rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
                  POST {base}/api/inbound/email | teams | slack | whatsapp<br />header x-crewlane-signature: hex HMAC-SHA256 of the body with the shared secret
                </p>
              ) : null}
              <ActionForm action={saveIntegrationAction.bind(null, p)} submitLabel="Save">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mode">
                    <Select name="mode" defaultValue={row?.mode ?? "simulator"}>
                      <option value="simulator">Simulator</option>
                      <option value="live">Live</option>
                    </Select>
                  </Field>
                  <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? true} /> Enabled</label>
                </div>
                {spec.fields.map((f) => (
                  <Field key={f.key} label={f.label}><Input name={f.key} defaultValue={row?.config[f.key] ?? ""} /></Field>
                ))}
                {spec.secretLabel ? (
                  <Field label={spec.secretLabel} hint={row?.secretCiphertext ? "A secret is stored. Leave empty to keep it." : undefined}>
                    {p === "google_workspace" ? <Textarea name="secret" rows={3} className="font-mono text-xs" autoComplete="off" /> : <Input name="secret" type="password" autoComplete="new-password" />}
                  </Field>
                ) : null}
              </ActionForm>
            </Card>
          );
        })}

        <Card title="Device discovery agent">
          <p className="mb-3 text-xs text-slate-500">
            Run <span className="font-mono">scripts/agent/crewlane-agent.sh</span> (macOS/Linux) or <span className="font-mono">crewlane-agent.ps1</span> (Windows) on a schedule. It posts hardware, disk health and installed software to <span className="font-mono">{base}/api/agent/report</span>.
          </p>
          <ul className="mb-4 space-y-1 text-sm">
            {data.tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>{t.name} {t.revokedAt ? <Badge>revoked</Badge> : <span className="text-xs text-slate-500">last used {t.lastUsedAt ? formatDateTime(t.lastUsedAt, ctx.tenant.timezone) : "never"}</span>}</span>
                {!t.revokedAt ? <ActionForm action={revokeAgentTokenAction.bind(null, t.id)} submitLabel="Revoke" variant="ghost" inline /> : null}
              </li>
            ))}
          </ul>
          <ActionForm action={createAgentTokenAction} submitLabel="Create token" variant="secondary" inline>
            <Input name="name" placeholder="Head office laptops" className="w-56" />
          </ActionForm>
        </Card>

        <Card title="Software blocklist">
          <p className="mb-3 text-xs text-slate-500">When the agent finds matching software, IT gets a P2 ticket.</p>
          <ul className="mb-4 flex flex-wrap gap-2">
            {data.blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm">
                {b.pattern}
                <ActionForm action={removeBlockAction.bind(null, b.id)} submitLabel="×" variant="ghost" inline />
              </li>
            ))}
          </ul>
          <ActionForm action={addBlockAction} submitLabel="Add" variant="secondary" inline resetOnSuccess>
            <Input name="pattern" placeholder="utorrent" className="w-48" />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
