import { asc, eq, ne } from "drizzle-orm";
import { buttonClass, Card, Input, PageHeader, Table } from "@/components/ui";
import { assetCategories, assets } from "@/db/schema";
import { netBookValue } from "@/lib/assets";
import { depreciationForPeriod } from "@/lib/depreciation";
import { requirePage, tenantTx } from "@/lib/session";
import { isoDateFromNow, money } from "@/lib/utils";

export default async function DepreciationReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePage("assets.read");
  const sp = await searchParams;
  const year = isoDateFromNow(0).slice(0, 4);
  const from = /^\d{4}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${year}-01`;
  const to = /^\d{4}-\d{2}$/.test(sp.to ?? "") ? sp.to! : isoDateFromNow(0).slice(0, 7);
  const rows = await tenantTx(ctx, (tx) =>
    tx.select({ a: assets, c: assetCategories }).from(assets).innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId)).where(ne(assets.status, "disposed")).orderBy(asc(assetCategories.name)),
  );
  const byCat = new Map<string, { name: string; count: number; cost: number; dep: number; nbv: number }>();
  for (const { a, c } of rows) {
    const e = byCat.get(c.id) ?? { name: c.name, count: 0, cost: 0, dep: 0, nbv: 0 };
    e.count++;
    e.cost += Number(a.purchaseCost);
    e.nbv += netBookValue(a, c, `${to}-28`);
    if (a.purchaseDate) {
      e.dep += depreciationForPeriod({ cost: Number(a.purchaseCost), salvage: Number(a.salvageValue), purchaseDate: a.purchaseDate, method: c.method, usefulLifeMonths: c.usefulLifeMonths, wdvRatePct: Number(c.wdvRate) }, `${from}-01`, `${to}-01`);
    }
    byCat.set(c.id, e);
  }
  const list = [...byCat.values()];
  const total = list.reduce((t, r) => ({ cost: t.cost + r.cost, dep: t.dep + r.dep, nbv: t.nbv + r.nbv }), { cost: 0, dep: 0, nbv: 0 });
  const cur = ctx.tenant.currency;

  return (
    <>
      <PageHeader title="Depreciation report" description="Charge for the period by category, with a line-by-line CSV for Finance." />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">From <Input name="from" type="month" defaultValue={from} className="w-40" /></label>
        <label className="text-sm">To <Input name="to" type="month" defaultValue={to} className="w-40" /></label>
        <button className={buttonClass("secondary")}>Update</button>
        <a className={buttonClass("primary")} href={`/api/reports/depreciation?from=${from}&to=${to}`}>Download CSV</a>
      </form>
      <Card>
        <Table>
          <thead><tr><th>Category</th><th className="text-right">Assets</th><th className="text-right">Cost</th><th className="text-right">Depreciation {from} to {to}</th><th className="text-right">Net book value</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="text-right">{r.count}</td>
                <td className="text-right tabular-nums">{money(r.cost, cur)}</td>
                <td className="text-right tabular-nums">{money(r.dep, cur)}</td>
                <td className="text-right tabular-nums">{money(r.nbv, cur)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td /><td className="text-right tabular-nums">{money(total.cost, cur)}</td>
              <td className="text-right tabular-nums">{money(total.dep, cur)}</td><td className="text-right tabular-nums">{money(total.nbv, cur)}</td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </>
  );
}
