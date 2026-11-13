import { and, eq, isNull } from "drizzle-orm";
import { agentTokens } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { sha256Hex } from "@/lib/crypto";
import { agentReportSchema, processAgentReport } from "@/lib/discovery";
import { log } from "@/lib/log";
import { currentTenant } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

/**
 * Device discovery agent endpoint, on the tenant's own host:
 *   POST https://<slug>.<root>/api/agent/report
 *   Authorization: Bearer cla_<token>
 */
export async function POST(request: Request) {
  const tenant = await currentTenant();
  if (!tenant) return Response.json({ error: "unknown tenant" }, { status: 404 });
  const raw = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const token = raw.startsWith("cla_") ? raw.slice(4) : "";
  if (!token) return Response.json({ error: "missing token" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = agentReportSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid report", issues: parsed.error.issues.slice(0, 5) }, { status: 422 });

  const result = await withTenant({ tenantId: tenant.id }, async (tx) => {
    const [t] = await tx
      .select()
      .from(agentTokens)
      .where(and(eq(agentTokens.tokenHash, sha256Hex(token)), isNull(agentTokens.revokedAt)));
    if (!t) return null;
    await tx.update(agentTokens).set({ lastUsedAt: new Date() }).where(eq(agentTokens.id, t.id));
    return processAgentReport(tx, tenant.id, tenant.currency, parsed.data);
  });
  if (!result) return Response.json({ error: "invalid token" }, { status: 401 });
  log.info("agent report", { tenant: tenant.slug, serial: parsed.data.serial, status: result.status });
  return Response.json(result);
}
