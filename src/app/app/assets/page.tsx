import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, buttonClass, EmptyState, Input, LinkButton, PageHeader, Select, Table } from "@/components/ui";
import { assetCategories, assets, assetStatus, employees } from "@/db/schema";
import { netBookValue } from "@/lib/assets";
import { requirePage, tenantTx } from "@/lib/session";
import { money } from "@/lib/utils";

const tone = { in_stock: "green", assigned: "blue", in_repair: "amber", lost: "red", disposed: "gray" } as const;

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string }> }) {
  const ctx = await requirePage("assets.read");
  const { q = "", status = "", category = "" } = await searchParams;
  const { rows, cats } = await tenantTx(ctx, async (tx) => {
    const conds: (SQL | undefined)[] = [];
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      conds.push(or(ilike(assets.tag, like), ilike(assets.name, like), ilike(assets.serialNo, like), ilike(assets.model, like)));
    }
    if ((assetStatus.enumValues as readonly string[]).includes(status)) conds.push(eq(assets.status, status as (typeof assetStatus.enumValues)[number]));
    if (/^[0-9a-f-]{36}$/.test(category)) conds.push(eq(assets.categoryId, category));
    const rows = await tx
      .select({ a: assets, c: assetCategories, first: employees.firstName, last: employees.lastName })
      .from(assets)
      .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
      .leftJoin(employees, eq(employees.id, assets.custodianEmployeeId))
      .where(and(...conds))
      .orderBy(asc(assets.tag))
      .limit(500);
    const cats = await tx.select().from(assetCategories).orderBy(asc(assetCategories.name));
    return { rows, cats };
  });
  const totals = rows.reduce(
    (t, r) => (r.a.status === "disposed" ? t : { cost: t.cost + Number(r.a.purchaseCost), nbv: t.nbv + netBookValue(r.a, r.c) }),
    { cost: 0, nbv: 0 },
  );

  return (
    <>
      <PageHeader
        title="Asset register"
        description={`${rows.length} assets · cost ${money(totals.cost, ctx.tenant.currency)} · net book value ${money(totals.nbv, ctx.tenant.currency)}`}
        actions={
          <>
            <LinkButton href="/app/assets/reports" variant="secondary">Depreciation report</LinkButton>
            {ctx.can("assets.manage") ? <LinkButton href="/app/assets/categories" variant="secondary">Categories and kits</LinkButton> : null}
            {ctx.can("assets.manage") ? <LinkButton href="/app/assets/new">Add asset</LinkButton> : null}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Tag, name, serial, model" className="max-w-xs" />
        <Select name="status" defaultValue={status} className="w-40">
          <option value="">Any status</option>
          {assetStatus.enumValues.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <Select name="category" defaultValue={category} className="w-48">
          <option value="">Any category</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <button className={buttonClass("secondary")}>Filter</button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState>No assets match.</EmptyState></div>
        ) : (
          <Table>
            <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Serial</th><th>Custodian</th><th>Status</th><th className="text-right">Net book value</th></tr></thead>
            <tbody>
              {rows.map(({ a, c, first, last }) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="font-mono text-xs"><Link className="text-brand hover:underline" href={`/app/assets/${a.id}`}>{a.tag}</Link></td>
                  <td>{a.name}</td>
                  <td>{c.name}</td>
                  <td className="font-mono text-xs text-slate-500">{a.serialNo}</td>
                  <td>{first ? `${first} ${last}` : ""}</td>
                  <td><Badge tone={tone[a.status]}>{a.status.replace("_", " ")}</Badge></td>
                  <td className="text-right tabular-nums">{money(netBookValue(a, c), a.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
