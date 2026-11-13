"use server";

import { resolveTxt } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDomains, tenants } from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { newToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { isValidCustomDomain, stripPort } from "@/lib/hosts";
import { requireAction, tenantTx } from "@/lib/session";

const brandingSchema = z.object({
  name: z.string().trim().min(2, "Enter the organisation name.").max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
  logoUrl: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Logo must be an https:// URL." })]),
  letterheadName: z.string().trim().max(160),
  letterheadAddress: z.string().trim().max(400),
});

export async function saveBrandingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const d = brandingSchema.parse(Object.fromEntries(fd));
    const branding = {
      primaryColor: d.primaryColor,
      logoUrl: d.logoUrl || undefined,
      letterheadName: d.letterheadName || undefined,
      letterheadAddress: d.letterheadAddress || undefined,
    };
    await tenantTx(ctx, async (tx) => {
      await tx.update(tenants).set({ name: d.name, branding }).where(eq(tenants.id, ctx.tenant.id));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "tenant.branding_changed", entityType: "tenant", entityId: ctx.tenant.id,
        before: { name: ctx.tenant.name, branding: ctx.tenant.branding }, after: { name: d.name, branding },
      });
    });
    revalidatePath("/", "layout");
    return "Branding saved.";
  });
}

export async function addDomainAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const domain = stripPort(String(fd.get("domain") ?? "").trim().toLowerCase());
    if (!isValidCustomDomain(domain)) throw new UserError("Enter a domain like hr.yourcompany.com.");
    if (domain.endsWith(stripPort(env.rootDomain))) throw new UserError("Use your own domain, not a Crewlane address.");
    await tenantTx(ctx, async (tx) => {
      const { token } = newToken(16);
      await tx.insert(tenantDomains).values({ tenantId: ctx.tenant.id, domain, verificationToken: `crewlane-verify=${token}` });
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "domain.added", entityType: "tenant_domain", entityId: domain,
      });
    });
    revalidatePath("/app/settings");
    return "Domain added. Create the DNS records below, then verify.";
  });
}

export async function verifyDomainAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const [d] = await tenantTx(ctx, (tx) =>
      tx.select().from(tenantDomains).where(and(eq(tenantDomains.id, id), eq(tenantDomains.tenantId, ctx.tenant.id))),
    );
    if (!d) throw new UserError("Domain not found.");
    let records: string[] = [];
    try {
      records = (await resolveTxt(`_crewlane.${d.domain}`)).map((r) => r.join(""));
    } catch {
      throw new UserError(`No TXT record found at _crewlane.${d.domain} yet. DNS can take a while to update.`);
    }
    if (!records.includes(d.verificationToken)) throw new UserError("The TXT record does not match. Check the value and try again.");
    await tenantTx(ctx, async (tx) => {
      await tx.update(tenantDomains).set({ verifiedAt: new Date() }).where(eq(tenantDomains.id, id));
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "domain.verified", entityType: "tenant_domain", entityId: d.domain,
      });
    });
    revalidatePath("/app/settings");
    return "Verified.";
  });
}

export async function removeDomainAction(id: string, _prev: ActionState): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    await tenantTx(ctx, async (tx) => {
      const [d] = await tx
        .delete(tenantDomains)
        .where(and(eq(tenantDomains.id, id), eq(tenantDomains.tenantId, ctx.tenant.id)))
        .returning();
      if (!d) throw new UserError("Domain not found.");
      await audit(tx, { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip }, {
        action: "domain.removed", entityType: "tenant_domain", entityId: d.domain,
      });
    });
    revalidatePath("/app/settings");
    return "Removed.";
  });
}
