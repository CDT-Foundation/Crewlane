import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { employees, tickets } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { addComment, createTicket } from "@/lib/helpdesk";
import { loadIntegration } from "@/lib/integrations";
import { currentTenant } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

const CHANNELS = ["email", "teams", "slack", "whatsapp", "kiosk"] as const;

/**
 * Generic inbound ticket webhook. Point a mail parser (SendGrid/Mailgun
 * inbound parse), a Teams or Slack workflow, or a WhatsApp gateway at:
 *   POST https://<slug>.<root>/api/inbound/<channel>
 *   x-crewlane-signature: hex(HMAC-SHA256(rawBody, sharedSecret))
 * Body: { from, subject?, text, externalId? }. Messages whose subject carries
 * a ticket number like [T-00042] are added to that ticket as replies.
 */
const bodySchema = z.object({
  from: z.string().min(3).max(200),
  subject: z.string().max(200).optional(),
  text: z.string().min(1).max(20000),
  externalId: z.string().max(200).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!(CHANNELS as readonly string[]).includes(channel)) return Response.json({ error: "unknown channel" }, { status: 404 });
  const tenant = await currentTenant();
  if (!tenant) return Response.json({ error: "unknown tenant" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 100_000) return Response.json({ error: "too large" }, { status: 413 });

  return withTenant({ tenantId: tenant.id }, async (tx) => {
    const cfg = await loadIntegration(tx, tenant.id, "inbound_webhook");
    if (!cfg?.enabled || !cfg.secret) return Response.json({ error: "inbound tickets are not enabled" }, { status: 403 });
    const expected = createHmac("sha256", cfg.secret).update(raw).digest();
    const given = Buffer.from(request.headers.get("x-crewlane-signature") ?? "", "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return Response.json({ error: "bad signature" }, { status: 401 });
    }
    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(JSON.parse(raw));
    } catch {
      return Response.json({ error: "invalid body" }, { status: 422 });
    }
    const from = body.from.trim().toLowerCase();
    const [emp] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(channel === "email" ? eq(employees.workEmail, from) : eq(employees.phone, body.from.trim()))
      .limit(1);
    const actor = { tenantId: tenant.id, userId: null };

    const ref = body.subject?.match(/\[(T-\d{5,})\]/)?.[1];
    if (ref) {
      const [t] = await tx.select().from(tickets).where(and(eq(tickets.number, ref)));
      if (t && t.status !== "closed") {
        await addComment(tx, actor, { ticketId: t.id, body: body.text, internal: false, asAgent: false, authorLabel: body.from });
        return Response.json({ ticket: t.number, action: "replied" });
      }
    }
    const t = await createTicket(tx, actor, {
      title: (body.subject || body.text.split("\n")[0]).slice(0, 160),
      description: body.text,
      category: "other",
      channel: channel as (typeof CHANNELS)[number],
      requesterEmployeeId: emp?.id ?? null,
      requesterContact: body.from,
      externalRef: body.externalId ?? null,
    });
    return Response.json({ ticket: t.number, action: "created" }, { status: 201 });
  });
}
