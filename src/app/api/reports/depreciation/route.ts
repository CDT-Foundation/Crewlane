import { eq, ne } from "drizzle-orm";
import { assetCategories, assets, employees } from "@/db/schema";
import { netBookValue } from "@/lib/assets";
import { depreciationForPeriod } from "@/lib/depreciation";
import { getAppContext, tenantTx } from "@/lib/session";

export const dynamic = "force-dynamic";

function csv(v: unknown) {
  const s = String(v ?? "");
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const ctx = await getAppContext();
  if (!ctx?.can("assets.read")) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const from = /^\d{4}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : "2026-01";
  const to = /^\d{4}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : from;
  const rows = await tenantTx(ctx, (tx) =>
    tx
      .select({ a: assets, c: assetCategories, first: employees.firstName, last: employees.lastName })
      .from(assets)
      .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
      .leftJoin(employees, eq(employees.id, assets.custodianEmployeeId))
      .where(ne(assets.status, "disposed")),
  );
  const header = ["tag", "name", "category", "serial", "custodian", "purchase_date", "cost", "salvage", "method", "life_months", "wdv_rate", `depreciation_${from}_${to}`, "net_book_value", "currency"];
  const lines = rows.map(({ a, c, first, last }) => {
    const dep = a.purchaseDate
      ? depreciationForPeriod({ cost: Number(a.purchaseCost), salvage: Number(a.salvageValue), purchaseDate: a.purchaseDate, method: c.method, usefulLifeMonths: c.usefulLifeMonths, wdvRatePct: Number(c.wdvRate) }, `${from}-01`, `${to}-01`)
      : 0;
    return [a.tag, a.name, c.name, a.serialNo, first ? `${first} ${last}` : "", a.purchaseDate, a.purchaseCost, a.salvageValue, c.method, c.usefulLifeMonths, c.wdvRate, dep.toFixed(2), netBookValue(a, c, `${to}-28`).toFixed(2), a.currency].map(csv).join(",");
  });
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="depreciation-${from}-${to}.csv"`,
    },
  });
}
