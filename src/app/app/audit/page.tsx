import { and, desc, eq, ilike, lt, type SQL, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, buttonClass, Card, Input, PageHeader, Table } from "@/components/ui";
import { auditLog, user } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

type Search = { action?: string; entity?: string; before?: string };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requirePage("audit.read");
  const { action = "", entity = "", before = "" } = await searchParams;

  const { rows, verify } = await tenantTx(ctx, async (tx) => {
    const conds: (SQL | undefined)[] = [];
    if (action) conds.push(ilike(auditLog.action, `%${action.replace(/[%_]/g, "")}%`));
    if (entity) conds.push(eq(auditLog.entityId, entity));
    if (/^\d+$/.test(before)) conds.push(lt(auditLog.seq, Number(before)));
    const rows = await tx
      .select({ a: auditLog, actor: user.name })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorUserId))
      .where(and(...conds))
      .orderBy(desc(auditLog.seq))
      .limit(PAGE);
    const [verify] = await tx.execute<{ checked: string; first_broken_seq: string | null }>(
      sql`select checked, first_broken_seq from audit_verify_chain()`,
    );
    return { rows, verify };
  });

  const last = rows.at(-1)?.a.seq;
  const intact = verify && verify.first_broken_seq === null;

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every change: who, which tenant, IP address, before and after. Append-only and hash-chained in the database, ready for ISO 27001 and SOC 2 evidence."
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {intact ? <Badge tone="green">chain intact</Badge> : <Badge tone="red">chain broken at #{verify?.first_broken_seq}</Badge>}
          <span className="text-slate-600">{verify?.checked ?? 0} entries verified against their SHA-256 hash chain just now.</span>
        </div>
      </Card>
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="action" defaultValue={action} placeholder="Filter by action, e.g. employee" className="max-w-xs" />
        {entity ? <input type="hidden" name="entity" value={entity} /> : null}
        <button className={buttonClass("secondary")}>Filter</button>
        {action || entity ? <Link href="/app/audit" className={buttonClass("ghost")}>Clear</Link> : null}
      </form>
      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>IP</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map(({ a, actor }) => (
              <tr key={a.id} className="align-top">
                <td className="font-mono text-xs text-slate-500">{a.seq}</td>
                <td className="whitespace-nowrap">{formatDateTime(a.createdAt, ctx.tenant.timezone)}</td>
                <td>{actor ?? "system"}</td>
                <td className="font-mono text-xs">{a.action}</td>
                <td className="text-xs">
                  {a.entityType}
                  {a.entityId ? <Link href={`/app/audit?entity=${a.entityId}`} className="block font-mono text-slate-500 hover:underline">{a.entityId.slice(0, 8)}</Link> : null}
                </td>
                <td className="font-mono text-xs text-slate-500">{a.ip}</td>
                <td className="max-w-md">
                  {a.before || a.after ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand">view</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">
                        {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
                      </pre>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">hash {a.hash}</p>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {rows.length === PAGE && last ? (
        <Link
          className={buttonClass("secondary", "mt-4")}
          href={`/app/audit?${new URLSearchParams({ ...(action && { action }), ...(entity && { entity }), before: String(last) })}`}
        >
          Older entries
        </Link>
      ) : null}
    </>
  );
}
