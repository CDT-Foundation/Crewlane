import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, PageHeader, buttonClass } from "@/components/ui";
import { gatePasses } from "@/db/schema";
import { findPassByToken } from "@/lib/gatepass";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime, isoDateFromNow, isPast } from "@/lib/utils";

/** Scanned in the last two minutes: show the guard a big confirmation. */
function recent(d: Date | null): d is Date {
  return Boolean(d) && !isPast(new Date(d!.getTime() + 120_000));
}
import { scanAction } from "../gate-passes/actions";

export default async function GatePage({ searchParams }: { searchParams: Promise<{ t?: string; n?: string }> }) {
  const ctx = await requirePage();
  if (!ctx.can("gatepass.scan") && !ctx.can("gatepass.manage")) {
    return <PageHeader title="Gate scan" description="You need the security guard role to use this page." />;
  }
  const { t, n } = await searchParams;
  const pass = await tenantTx(ctx, async (tx) => {
    if (t) return findPassByToken(tx, t);
    if (n) return (await tx.select().from(gatePasses).where(eq(gatePasses.number, n.trim().toUpperCase())))[0] ?? null;
    return null;
  });
  const searched = Boolean(t || n);
  const today = isoDateFromNow(0);
  const tz = ctx.tenant.timezone;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Gate scan" description="Scan the QR code on the pass with this device's camera app, or type the pass number." />
      <form className="mb-6 flex gap-2">
        <Input name="n" placeholder="GP-00001" defaultValue={n} className="text-lg" autoFocus />
        <button className={buttonClass("primary")}>Find</button>
      </form>
      {searched && !pass ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-6 text-center">
          <p className="text-xl font-bold text-red-700">NOT VALID</p>
          <p className="text-sm text-red-700">No pass matches. Do not let the item leave.</p>
        </div>
      ) : null}
      {pass && recent(pass.inAt) ? (
        <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center text-lg font-semibold text-emerald-800">
          ✓ Back on site at {formatDateTime(pass.inAt, tz).split(", ").pop()}
        </div>
      ) : pass && recent(pass.outAt) ? (
        <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center text-lg font-semibold text-emerald-800">
          ✓ Left site at {formatDateTime(pass.outAt, tz).split(", ").pop()}
        </div>
      ) : null}
      {pass ? (
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xl font-bold">{pass.number}</p>
              <Badge tone={pass.status === "approved" ? "green" : pass.status === "out" ? "amber" : "gray"}>{pass.status}</Badge>
            </div>
            <p className="text-lg">{pass.description}</p>
            <p className="text-sm text-slate-600">Carried by <b>{pass.carrierName}</b> to {pass.destination}</p>
            <p className="text-sm text-slate-600">
              {pass.type === "returnable" ? `Returnable, due back ${pass.expectedReturnOn}` : "Non-returnable"}
              {pass.status === "out" && pass.expectedReturnOn && pass.expectedReturnOn < today ? <> <Badge tone="red">overdue</Badge></> : null}
            </p>
            {pass.outAt ? <p className="text-xs text-slate-500">Left {formatDateTime(pass.outAt, tz)}</p> : null}
            <div className="flex gap-3 pt-2">
              {pass.status === "approved" ? <ActionForm action={scanAction.bind(null, pass.id, "out")} submitLabel="Allow out" inline /> : null}
              {pass.status === "out" ? <ActionForm action={scanAction.bind(null, pass.id, "in")} submitLabel="Record return" inline /> : null}
              {["returned", "closed", "cancelled"].includes(pass.status) ? <p className="text-sm font-medium text-red-700">This pass is {pass.status}. It cannot be used again.</p> : null}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
