import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Qr } from "@/components/qr";
import { assets } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { tenantUrl } from "@/lib/tenancy";
import { PrintButton } from "../../../letters/issued/[id]/print-button";

export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("assets.read");
  const [a] = await tenantTx(ctx, (tx) => tx.select().from(assets).where(eq(assets.id, id)));
  if (!a) notFound();
  return (
    <div>
      <div className="no-print mb-4"><PrintButton /></div>
      <div className="inline-flex items-center gap-4 rounded-lg border-2 border-slate-900 bg-white p-4" style={{ width: "90mm" }}>
        <Qr value={tenantUrl(ctx.tenant.slug, `/app/assets/${a.id}`)} size={110} />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{ctx.tenant.name}</p>
          <p className="font-mono text-xl font-bold">{a.tag}</p>
          <p className="truncate text-sm">{a.name}</p>
          {a.serialNo ? <p className="font-mono text-xs text-slate-500">S/N {a.serialNo}</p> : null}
          <p className="mt-1 text-[10px] text-slate-500">Property of {ctx.tenant.name}. If found, please return.</p>
        </div>
      </div>
    </div>
  );
}
