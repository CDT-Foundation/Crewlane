import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { employees, letters, user } from "@/db/schema";
import { canSeeEmployee } from "@/lib/employees";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PrintButton } from "./print-button";

export default async function IssuedLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("employees.read");
  const scope = ctx.scope("employees.read")!;
  const row = await tenantTx(ctx, async (tx) => {
    const [r] = await tx
      .select({ l: letters, issuer: user.name, employeeNo: employees.employeeNo })
      .from(letters)
      .innerJoin(employees, eq(employees.id, letters.employeeId))
      .leftJoin(user, eq(user.id, letters.issuedBy))
      .where(eq(letters.id, id));
    if (!r) return null;
    return (await canSeeEmployee(tx, scope, ctx.employeeId, r.l.employeeId)) ? r : null;
  });
  if (!row) notFound();
  const b = ctx.tenant.branding;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="rounded-xl border border-slate-200 bg-white p-12 print:border-0 print:p-0">
        <header className="mb-10 flex items-center justify-between border-b-4 pb-4" style={{ borderColor: "var(--brand)" }}>
          <div>
            <p className="text-lg font-semibold">{b.letterheadName || ctx.tenant.name}</p>
            {b.letterheadAddress ? <p className="whitespace-pre-line text-xs text-slate-600">{b.letterheadAddress}</p> : null}
          </div>
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="h-12 w-auto" />
          ) : null}
        </header>
        <div className="whitespace-pre-wrap font-serif text-[15px] leading-7">{row.l.body}</div>
        <footer className="mt-12 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
          Digitally issued by {row.issuer} on {formatDateTime(row.l.issuedAt, ctx.tenant.timezone)} · Ref {row.employeeNo}/{row.l.id.slice(0, 8)}
          <br />
          Verification hash: <span className="font-mono">{row.l.signatureHash}</span>
        </footer>
      </article>
    </div>
  );
}
