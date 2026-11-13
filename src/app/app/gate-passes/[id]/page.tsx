import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Qr } from "@/components/qr";
import { Badge } from "@/components/ui";
import { gatePasses, user } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { tenantUrl } from "@/lib/tenancy";
import { formatDateTime } from "@/lib/utils";
import { PrintButton } from "../../letters/issued/[id]/print-button";
import { cancelPassAction } from "../actions";

export default async function PassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("gatepass.manage");
  const [row] = await tenantTx(ctx, (tx) =>
    tx.select({ p: gatePasses, by: user.name }).from(gatePasses).leftJoin(user, eq(user.id, gatePasses.issuedBy)).where(eq(gatePasses.id, id)),
  );
  if (!row) notFound();
  const { p } = row;
  const tz = ctx.tenant.timezone;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <PrintButton />
        {p.status === "approved" ? <ActionForm action={cancelPassAction.bind(null, p.id)} submitLabel="Cancel pass" variant="ghost" inline confirm="Cancel this pass?" /> : null}
      </div>
      <article className="rounded-xl border-2 border-slate-900 bg-white p-8">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">{ctx.tenant.name}</p>
            <h1 className="text-2xl font-bold">{p.type === "returnable" ? "Returnable" : "Non-returnable"} gate pass</h1>
            <p className="font-mono text-lg">{p.number}</p>
            <Badge>{p.status}</Badge>
          </div>
          {t ? (
            <div className="text-center">
              <Qr value={tenantUrl(ctx.tenant.slug, `/app/gate?t=${encodeURIComponent(t)}`)} size={140} />
              <p className="mt-1 text-[10px] text-slate-500">Security: scan at the gate</p>
            </div>
          ) : (
            <p className="no-print max-w-[14rem] text-xs text-slate-500">The QR code is shown only when the pass is issued. Security can also enter the pass number at the gate.</p>
          )}
        </header>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Item</dt><dd className="font-medium">{p.description}</dd></div>
          <div><dt className="text-slate-500">Carried by</dt><dd>{p.carrierName}</dd></div>
          <div><dt className="text-slate-500">Destination</dt><dd>{p.destination}</dd></div>
          <div><dt className="text-slate-500">Reason</dt><dd>{p.reason ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Expected back</dt><dd>{p.expectedReturnOn ?? "Not returning"}</dd></div>
          <div><dt className="text-slate-500">Issued by</dt><dd>{row.by} · {formatDateTime(p.createdAt, tz)}</dd></div>
          <div><dt className="text-slate-500">Left site</dt><dd>{p.outAt ? formatDateTime(p.outAt, tz) : "—"}</dd></div>
          <div><dt className="text-slate-500">Returned</dt><dd>{p.inAt ? formatDateTime(p.inAt, tz) : "—"}</dd></div>
        </dl>
        <footer className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-500">
          <p className="border-t border-slate-400 pt-1">Carrier signature</p>
          <p className="border-t border-slate-400 pt-1">Security officer</p>
        </footer>
      </article>
    </div>
  );
}
