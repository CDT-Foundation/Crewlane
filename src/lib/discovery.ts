/**
 * Device discovery agent reports. Matches devices to the register by serial
 * number, records specs and installed software, adds unknown devices to stock
 * and raises a ticket when blocklisted software is found.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { assetCategories, assetEvents, assets, softwareBlocklist, tickets } from "@/db/schema";
import { createAsset } from "./assets";
import { type Actor } from "./audit";
import { createTicket } from "./helpdesk";
import { notifyPermission } from "./notify";

export const agentReportSchema = z.object({
  hostname: z.string().max(255),
  serial: z.string().min(2).max(120),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  chassis: z.enum(["laptop", "desktop", "server", "other"]).optional(),
  os: z.string().max(200).optional(),
  cpu: z.string().max(200).optional(),
  ramGb: z.number().nonnegative().max(4096).optional(),
  diskGb: z.number().nonnegative().max(1_000_000).optional(),
  diskHealth: z.string().max(60).optional(),
  loggedInUser: z.string().max(200).optional(),
  software: z.array(z.string().max(200)).max(2000).default([]),
});

export type AgentReport = z.infer<typeof agentReportSchema>;

export function blocklistHits(software: string[], patterns: string[]) {
  const lower = software.map((s) => s.toLowerCase());
  return patterns.filter((p) => lower.some((s) => s.includes(p.toLowerCase())));
}

export async function processAgentReport(tx: Tx, tenantId: string, currency: string, report: AgentReport) {
  const actor: Actor = { tenantId, userId: null };
  const specs = {
    hostname: report.hostname, os: report.os, cpu: report.cpu, ramGb: report.ramGb, diskGb: report.diskGb,
    diskHealth: report.diskHealth, loggedInUser: report.loggedInUser, manufacturer: report.manufacturer, model: report.model,
  };
  let [asset] = await tx.select().from(assets).where(eq(assets.serialNo, report.serial)).limit(1);
  let discovered = false;
  if (!asset) {
    const code = report.chassis === "laptop" ? "LAP" : "DSK";
    const [cat] = await tx.select().from(assetCategories).where(eq(assetCategories.code, code));
    if (!cat) return { status: "no_category" as const };
    asset = await createAsset(
      tx,
      actor,
      { categoryId: cat.id, name: `${report.manufacturer ?? ""} ${report.model ?? report.hostname}`.trim(), make: report.manufacturer, model: report.model, serialNo: report.serial, currency, condition: "good" },
      "Found by the device discovery agent",
    );
    discovered = true;
    await notifyPermission(tx, tenantId, "assets.manage", {
      kind: "asset", title: `Unregistered device found: ${report.hostname} (${report.serial})`, body: "Added to stock as discovered. Check its owner and cost.", href: `/app/assets/${asset.id}`, email: false,
    });
  }
  await tx
    .update(assets)
    .set({ specs, software: report.software, lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(assets.id, asset.id));
  if (discovered) await tx.insert(assetEvents).values({ tenantId, assetId: asset.id, type: "discovered", notes: report.hostname });

  const patterns = (await tx.select({ p: softwareBlocklist.pattern }).from(softwareBlocklist)).map((r) => r.p);
  const hits = blocklistHits(report.software, patterns);
  if (hits.length) {
    const ref = `agent:${asset.id}:${hits.sort().join(",")}`;
    const [open] = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.externalRef, ref)));
    if (!open) {
      await createTicket(tx, actor, {
        title: `Unauthorised software on ${asset.tag} (${report.hostname})`,
        description: `The discovery agent found: ${hits.join(", ")}.\nLogged-in user: ${report.loggedInUser ?? "unknown"}.`,
        category: "software", priority: "p2", channel: "system", assetId: asset.id, externalRef: ref,
      });
    }
  }
  return { status: discovered ? ("discovered" as const) : ("updated" as const), assetId: asset.id, alerts: hits };
}
