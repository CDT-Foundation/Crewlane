/**
 * Crewlane event worker. Drains the transactional outbox (outbox_events) and
 * runs a handler for each event inside that event's tenant context.
 *
 * Phase 1 handlers only log. Phase 2 subscribes here to raise IT provisioning
 * tickets on `employee.hired` and to open the asset-clearance gate on
 * `employee.offboarding_started`.
 *
 *   WORKER_DATABASE_URL   connection as role crewlane_worker
 *   WORKER_PORT           health + metrics port (default 8081)
 *   WORKER_POLL_MS        idle poll interval (default 1000)
 */
import { createServer } from "node:http";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { Counter, collectDefaultMetrics, Registry } from "prom-client";
import { closePools, getPool, type Tx } from "@/db/client";
import { outboxEvents } from "@/db/schema";
import { sendMail } from "@/integrations/email";
import { provisionAccount } from "@/lib/identity-jobs";
import { loadIntegration } from "@/lib/integrations";
import { log } from "@/lib/log";
import { onEmployeeHired } from "@/lib/onboarding";
import { runSchedulerTick } from "./scheduler";

const MAX_ATTEMPTS = 10;
type Event = typeof outboxEvents.$inferSelect;
type Handler = (tx: Tx, event: Event) => Promise<void>;

export const handlers: Record<string, Handler> = {
  // Zero-touch onboarding: IT ticket, accounts and the equipment kit.
  "employee.hired": async (tx, e) => {
    await onEmployeeHired(tx, e.tenantId, String(e.payload.employeeId));
  },
  "identity.provision": async (tx, e) => {
    await provisionAccount(tx, e.tenantId, String(e.payload.accountId));
  },
  "email.send": async (tx, e) => {
    const cfg = await loadIntegration(tx, e.tenantId, "smtp");
    const p = e.payload as { to: string[]; subject: string; text: string };
    await sendMail(cfg?.enabled ? cfg : null, p);
  },
  "employee.activated": async (_tx, e) => {
    log.info("employee activated", { tenantId: e.tenantId, ...e.payload });
  },
  "employee.offboarding_started": async (_tx, e) => {
    log.info("offboarding started; clearance is open", { tenantId: e.tenantId, ...e.payload });
  },
  "clearance.opened": async () => {},
  "clearance.cleared": async (_tx, e) => {
    log.info("clearance complete; final settlement released", { tenantId: e.tenantId, ...e.payload });
  },
  "ticket.created": async () => {},
  "preboarding.submitted": async (_tx, e) => {
    log.info("pre-boarding form submitted", { tenantId: e.tenantId, ...e.payload });
  },
  "approval.requested": async () => {},
};

const registry = new Registry();
registry.setDefaultLabels({ service: "crewlane-worker" });
collectDefaultMetrics({ register: registry });
const processed = new Counter({
  name: "crewlane_outbox_events_total",
  help: "Outbox events handled, by type and result",
  labelNames: ["type", "result"] as const,
  registers: [registry],
});

/** Claims and handles one event. Returns false when the queue is empty. */
export async function processOne(): Promise<boolean> {
  const { db } = getPool("WORKER_DATABASE_URL");
  let claimed: Event | undefined;
  try {
    return await db.transaction(async (tx) => {
      [claimed] = await tx
        .select()
        .from(outboxEvents)
        .where(and(isNull(outboxEvents.processedAt), lt(outboxEvents.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(outboxEvents.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!claimed) return false;
      // From here on, row-level security limits the handler to this tenant.
      await tx.execute(sql`select set_config('app.tenant_id', ${claimed.tenantId}, true)`);
      const handler = handlers[claimed.type];
      if (handler) await handler(tx, claimed);
      else log.warn("no handler for event type", { type: claimed.type, id: claimed.id });
      await tx.update(outboxEvents).set({ processedAt: new Date() }).where(eq(outboxEvents.id, claimed.id));
      processed.inc({ type: claimed.type, result: "ok" });
      return true;
    });
  } catch (err) {
    if (!claimed) throw err;
    const event = claimed as Event;
    processed.inc({ type: event.type, result: "error" });
    log.error("event handler failed", { id: event.id, type: event.type, attempt: event.attempts + 1, error: String(err) });
    await db
      .update(outboxEvents)
      .set({ attempts: sql`${outboxEvents.attempts} + 1`, lastError: String(err).slice(0, 2000) })
      .where(eq(outboxEvents.id, event.id));
    return true;
  }
}

async function main() {
  const pollMs = Number(process.env.WORKER_POLL_MS ?? 1000);
  const port = Number(process.env.WORKER_PORT ?? 8081);
  let running = true;
  let healthy = true;

  const server = createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(healthy ? 200 : 503).end(healthy ? "ok" : "unhealthy");
    } else if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": registry.contentType }).end(await registry.metrics());
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(port, () => log.info("worker started", { port, pollMs }));

  const stop = async (signal: string) => {
    log.info("worker stopping", { signal });
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  const tickMs = Number(process.env.WORKER_SCHEDULER_MS ?? 60_000);
  let nextTick = 0;
  while (running) {
    if (Date.now() >= nextTick) {
      nextTick = Date.now() + tickMs;
      try {
        const r = await runSchedulerTick(getPool("WORKER_DATABASE_URL").db);
        if (!r.skipped) log.info("scheduler tick", r);
      } catch (err) {
        log.error("scheduler tick failed", { error: String(err) });
      }
    }
    try {
      const didWork = await processOne();
      healthy = true;
      if (!didWork) await new Promise((r) => setTimeout(r, pollMs));
    } catch (err) {
      healthy = false;
      log.error("worker loop error", { error: String(err) });
      await new Promise((r) => setTimeout(r, Math.min(pollMs * 5, 10_000)));
    }
  }
  server.close();
  await closePools();
  log.info("worker stopped");
}

if (process.env.CREWLANE_WORKER_AUTOSTART !== "false") {
  main().catch((err) => {
    log.error("worker crashed", { error: String(err) });
    process.exit(1);
  });
}
