import { and, desc, eq, notInArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Qr } from "@/components/qr";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table } from "@/components/ui";
import { assetCategories, assetEvents, assets, employees, orgUnits, tickets, user, vendors } from "@/db/schema";
import { netBookValue } from "@/lib/assets";
import { annualSchedule } from "@/lib/depreciation";
import { requirePage, tenantTx } from "@/lib/session";
import { tenantUrl } from "@/lib/tenancy";
import { formatDateTime, money } from "@/lib/utils";
import {
  assignAssetAction, disposeAction, lostAssetAction, repairAction, returnAssetAction, signHandoverAction, updateAssetAction,
} from "../actions";
import { AssetFields } from "../asset-fields";
import { assetFormOptions } from "../options";

const tone = { in_stock: "green", assigned: "blue", in_repair: "amber", lost: "red", disposed: "gray" } as const;
const CONDITIONS = ["new", "good", "fair", "poor", "damaged"];

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage();
  const data = await tenantTx(ctx, async (tx) => {
    const [row] = await tx
      .select({ a: assets, c: assetCategories, unit: orgUnits.name, vendor: vendors.name, first: employees.firstName, last: employees.lastName })
      .from(assets)
      .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
      .leftJoin(orgUnits, eq(orgUnits.id, assets.locationUnitId))
      .leftJoin(vendors, eq(vendors.id, assets.vendorId))
      .leftJoin(employees, eq(employees.id, assets.custodianEmployeeId))
      .where(eq(assets.id, id));
    if (!row) return null;
    // Custodians may view their own equipment without assets.read.
    if (!ctx.can("assets.read") && row.a.custodianEmployeeId !== ctx.employeeId) return null;
    const events = await tx
      .select({ e: assetEvents, emp: employees.firstName, empLast: employees.lastName, actor: user.name })
      .from(assetEvents)
      .leftJoin(employees, eq(employees.id, assetEvents.employeeId))
      .leftJoin(user, eq(user.id, assetEvents.actorUserId))
      .where(eq(assetEvents.assetId, id))
      .orderBy(desc(assetEvents.createdAt));
    const people = ctx.can("assets.manage")
      ? await tx.select({ id: employees.id, first: employees.firstName, last: employees.lastName, no: employees.employeeNo }).from(employees).where(notInArray(employees.status, ["resigned", "terminated"])).orderBy(employees.firstName)
      : [];
    const opts = ctx.can("assets.manage") ? await assetFormOptions(tx) : null;
    const related = await tx.select().from(tickets).where(and(eq(tickets.assetId, id))).orderBy(desc(tickets.createdAt)).limit(10);
    return { ...row, events, people, opts, related };
  });
  if (!data) notFound();
  const { a, c } = data;
  const tz = ctx.tenant.timezone;
  const manage = ctx.can("assets.manage");
  const lastAssign = data.events.find((e) => e.e.type === "assigned");
  const unsigned = a.status === "assigned" && lastAssign && !data.events.some((e) => e.e.type === "assigned" && e.e.signatureHash && e.e.employeeId === a.custodianEmployeeId);
  const schedule = a.purchaseDate
    ? annualSchedule({ cost: Number(a.purchaseCost), salvage: Number(a.salvageValue), purchaseDate: a.purchaseDate, method: c.method, usefulLifeMonths: c.usefulLifeMonths, wdvRatePct: Number(c.wdvRate) })
    : [];
  const specs = (a.specs ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader
        title={`${a.tag} · ${a.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={tone[a.status]}>{a.status.replace("_", " ")}</Badge>
            <span>{c.name}</span>
            {data.first ? <span>· with {data.first} {data.last}</span> : null}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/app/assets/${a.id}/label`} variant="secondary">Print label</LinkButton>
            {ctx.can("gatepass.manage") && a.status !== "disposed" ? <LinkButton href={`/app/gate-passes/new?asset=${a.id}`} variant="secondary">Gate pass</LinkButton> : null}
            <LinkButton href={`/app/helpdesk/new?asset=${a.id}`} variant="secondary">Report a fault</LinkButton>
          </>
        }
      />

      {unsigned && manage ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2 font-medium">Handover not signed yet. Ask {data.first} {data.last} to type their full name to sign for this item.</p>
          <ActionForm action={signHandoverAction.bind(null, a.id)} submitLabel="Sign handover" variant="secondary" inline>
            <Input name="signatureName" placeholder={`${data.first} ${data.last}`} className="w-64" required />
          </ActionForm>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Details">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <D label="Make / model" v={[a.make, a.model].filter(Boolean).join(" ")} />
              <D label="Serial" v={a.serialNo} mono />
              <D label="RFID" v={a.rfid} mono />
              <D label="Purchased" v={a.purchaseDate} />
              <D label="Cost" v={money(a.purchaseCost, a.currency)} />
              <D label="Net book value" v={money(netBookValue(a, c), a.currency)} />
              <D label="Vendor" v={data.vendor} />
              <D label="Warranty until" v={a.warrantyUntil} />
              <D label="Location" v={data.unit} />
              <D label="Condition" v={a.condition} />
              <D label="Depreciation" v={c.method === "straight_line" ? `Straight line, ${c.usefulLifeMonths} months` : `Written-down value, ${c.wdvRate}% a year`} />
              <D label="Last seen by agent" v={a.lastSeenAt ? formatDateTime(a.lastSeenAt, tz) : null} />
            </dl>
            {Object.keys(specs).length ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs">
                <p className="mb-1 font-medium text-slate-700">Reported by the device agent</p>
                <p className="text-slate-600">
                  {["hostname", "os", "cpu", "ramGb", "diskGb", "diskHealth", "loggedInUser"]
                    .filter((k) => specs[k] !== undefined && specs[k] !== null)
                    .map((k) => `${k}: ${String(specs[k])}`)
                    .join(" · ")}
                </p>
                {a.software?.length ? <p className="mt-1 text-slate-500">{a.software.length} applications installed</p> : null}
              </div>
            ) : null}
            {manage && data.opts ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-brand">Edit details</summary>
                <div className="mt-3">
                  <ActionForm action={updateAssetAction.bind(null, a.id)} submitLabel="Save">
                    <AssetFields a={a} {...data.opts} />
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </Card>

          {schedule.length ? (
            <Card title="Depreciation schedule">
              <Table>
                <thead><tr><th>Year</th><th className="text-right">Opening</th><th className="text-right">Depreciation</th><th className="text-right">Closing</th></tr></thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.year}>
                      <td>{r.year}</td>
                      <td className="text-right tabular-nums">{money(r.opening, a.currency)}</td>
                      <td className="text-right tabular-nums">{money(r.depreciation, a.currency)}</td>
                      <td className="text-right tabular-nums">{money(r.closing, a.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          <Card title="Custody history">
            <ol className="space-y-3 text-sm">
              {data.events.map(({ e, emp, empLast, actor }) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-xs text-slate-500">{formatDateTime(e.createdAt, tz)}</span>
                  <div>
                    <p>
                      <span className="font-medium">{e.type.replace("_", " ")}</span>
                      {emp ? <> · {emp} {empLast}</> : null}
                      {e.condition ? <span className="text-slate-500"> · {e.condition}</span> : null}
                      {actor ? <span className="text-slate-500"> · by {actor}</span> : null}
                    </p>
                    {e.signatureName ? <p className="text-xs text-slate-500">Signed “{e.signatureName}” · <span className="font-mono">{e.signatureHash?.slice(0, 16)}…</span></p> : null}
                    {e.notes ? <p className="text-xs text-slate-500">{e.notes}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Label">
            <div className="flex items-center gap-4">
              <Qr value={tenantUrl(ctx.tenant.slug, `/app/assets/${a.id}`)} size={110} />
              <div className="text-sm">
                <p className="font-mono font-semibold">{a.tag}</p>
                <p className="text-slate-500">Scan to open this record.</p>
              </div>
            </div>
          </Card>

          {manage && a.status === "in_stock" ? (
            <Card title="Hand over">
              <ActionForm action={assignAssetAction.bind(null, a.id)} submitLabel="Hand over">
                <Field label="To">
                  <Select name="employeeId" required>
                    <option value="">Choose…</option>
                    {data.people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last} ({p.no})</option>)}
                  </Select>
                </Field>
                <Field label="Condition">
                  <Select name="condition" defaultValue={a.condition}>{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</Select>
                </Field>
                <Field label="Recipient signature" hint="The recipient types their full name to accept the item."><Input name="signatureName" required /></Field>
                <Field label="Notes"><Input name="notes" placeholder="Charger, bag" /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {manage && a.status === "assigned" ? (
            <Card title="Take back">
              <ActionForm action={returnAssetAction.bind(null, a.id)} submitLabel="Record return">
                <Field label="Condition">
                  <Select name="condition" defaultValue="good">{CONDITIONS.map((x) => <option key={x}>{x}</option>)}</Select>
                </Field>
                <Field label="Returned by (signature)"><Input name="signatureName" placeholder={`${data.first} ${data.last}`} /></Field>
                <Field label="Notes"><Input name="notes" /></Field>
              </ActionForm>
            </Card>
          ) : null}

          {manage && a.status !== "disposed" && a.status !== "lost" ? (
            <Card title="Other actions">
              <div className="space-y-4">
                {a.status === "in_stock" ? <ActionForm action={repairAction.bind(null, a.id, true)} submitLabel="Send for repair" variant="secondary" inline /> : null}
                {a.status === "in_repair" ? <ActionForm action={repairAction.bind(null, a.id, false)} submitLabel="Back from repair" variant="secondary" inline /> : null}
                <ActionForm action={lostAssetAction.bind(null, a.id)} submitLabel="Mark lost" variant="danger" confirm="Mark this asset as lost?">
                  {a.custodianEmployeeId ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="charge" /> Recover the net book value from {data.first}&apos;s pay
                    </label>
                  ) : null}
                  <Input name="notes" placeholder="What happened" />
                </ActionForm>
                {a.status !== "assigned" ? (
                  <ActionForm action={disposeAction.bind(null, a.id)} submitLabel="Dispose" variant="ghost" confirm="Dispose of this asset?">
                    <Input name="notes" placeholder="Sold / scrapped / donated" />
                  </ActionForm>
                ) : null}
              </div>
            </Card>
          ) : null}

          {data.related.length ? (
            <Card title="Incident history">
              <ul className="space-y-1 text-sm">
                {data.related.map((t) => (
                  <li key={t.id}><Link className="text-brand hover:underline" href={`/app/helpdesk/${t.id}`}>{t.number}</Link> {t.title} <Badge>{t.status}</Badge></li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function D({ label, v, mono }: { label: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{v || "—"}</dd>
    </div>
  );
}
