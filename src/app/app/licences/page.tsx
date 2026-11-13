import { asc, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { licenceAssignments, orgUnits, softwareSubscriptions, vendors } from "@/db/schema";
import { annualCost } from "@/lib/licences";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow, money } from "@/lib/utils";
import { saveSubscriptionAction } from "./actions";
import { subscriptionOptions } from "./options";
import { SubscriptionFields } from "./sub-fields";

export default async function LicencesPage() {
  const ctx = await requirePage("licences.manage");
  const data = await tenantTx(ctx, async (tx) => {
    const used = await tx
      .select({ id: licenceAssignments.subscriptionId, n: count() })
      .from(licenceAssignments)
      .where(isNull(licenceAssignments.revokedAt))
      .groupBy(licenceAssignments.subscriptionId);
    const subs = await tx
      .select({ s: softwareSubscriptions, vendor: vendors.name, unit: orgUnits.name })
      .from(softwareSubscriptions)
      .leftJoin(vendors, eq(vendors.id, softwareSubscriptions.vendorId))
      .leftJoin(orgUnits, eq(orgUnits.id, softwareSubscriptions.costUnitId))
      .orderBy(asc(softwareSubscriptions.renewalDate));
    return { subs, used: new Map(used.map((u) => [u.id, u.n])), opts: await subscriptionOptions(tx) };
  });
  const soon = isoDateFromNow(30);
  const byUnit = new Map<string, number>();
  for (const { s, unit } of data.subs) byUnit.set(unit ?? "Unallocated", (byUnit.get(unit ?? "Unallocated") ?? 0) + annualCost(s));
  const total = [...byUnit.values()].reduce((a, b) => a + b, 0);
  const idle = data.subs.reduce((n, { s }) => n + Math.max(0, s.seatsTotal - (data.used.get(s.id) ?? 0)), 0);

  return (
    <>
      <PageHeader
        title="Software and licences"
        description={`Annual spend ${money(total, ctx.tenant.currency)} · ${idle} unused seat(s). Reminders go out 30, 14 and 7 days before each renewal.`}
      />
      <div className="space-y-6">
        <Card title="Subscriptions">
          {data.subs.length === 0 ? (
            <EmptyState>No subscriptions tracked yet.</EmptyState>
          ) : (
            <Table>
              <thead><tr><th>Product</th><th>Vendor</th><th>Seats used</th><th className="text-right">Annual cost</th><th>Charged to</th><th>Renews</th></tr></thead>
              <tbody>
                {data.subs.map(({ s, vendor, unit }) => {
                  const u = data.used.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td><Link className="font-medium text-brand hover:underline" href={`/app/licences/${s.id}`}>{s.product}</Link>{s.plan ? <span className="text-slate-500"> · {s.plan}</span> : null}</td>
                      <td>{vendor}</td>
                      <td>{u} / {s.seatsTotal} {s.seatsTotal - u > 0 ? <Badge tone="amber">{s.seatsTotal - u} idle</Badge> : null}</td>
                      <td className="text-right tabular-nums">{money(annualCost(s), s.currency)}</td>
                      <td>{unit}</td>
                      <td>{s.renewalDate} {s.renewalDate <= soon ? <Badge tone="red">soon</Badge> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        {byUnit.size ? (
          <Card title="Annual cost by business unit">
            <ul className="space-y-1 text-sm">
              {[...byUnit.entries()].map(([u, v]) => <li key={u} className="flex justify-between"><span>{u}</span><span className="tabular-nums">{money(v, ctx.tenant.currency)}</span></li>)}
            </ul>
          </Card>
        ) : null}
        <Card title="Track a subscription">
          <ActionForm action={saveSubscriptionAction.bind(null, null)} submitLabel="Add subscription">
            <SubscriptionFields {...data.opts} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
