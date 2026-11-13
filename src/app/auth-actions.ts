"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { memberships, tenants } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { type ActionState, formString, userMessage } from "@/lib/actions";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { isValidSlug } from "@/lib/hosts";
import { log } from "@/lib/log";
import { metrics } from "@/lib/metrics";
import { provisionTenant } from "@/lib/provision";
import { currentTenant, tenantUrl } from "@/lib/tenancy";

const INVALID = "Invalid email or password.";

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const tenant = await currentTenant();
  if (!tenant) return { error: "Unknown organisation." };
  const email = formString(fd, "email").toLowerCase();
  const password = formString(fd, "password");
  if (!email || !password) return { error: INVALID };

  // Only members of this tenant may sign in on its host. Checked before the
  // password so no session is ever created for a non-member.
  const ctx = await getAuth().$context;
  const found = await ctx.internalAdapter.findUserByEmail(email);
  const member = found
    ? await withTenant({ tenantId: tenant.id, userId: found.user.id }, async (tx) => {
        const [m] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, found.user.id), eq(memberships.active, true)))
          .limit(1);
        return m;
      })
    : undefined;
  if (!member) {
    metrics.signIns.inc({ result: "not_member" });
    return { error: INVALID };
  }

  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch {
    metrics.signIns.inc({ result: "failed" });
    log.info("sign-in failed", { tenant: tenant.slug });
    return { error: INVALID };
  }
  metrics.signIns.inc({ result: "ok" });
  redirect("/app");
}

export async function signOutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function findOrganisationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const slug = formString(fd, "slug").toLowerCase();
  if (!isValidSlug(slug)) return { error: "Enter your organisation's Crewlane address." };
  const [t] = await getDb().select({ slug: tenants.slug }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!t) return { error: "We couldn't find that organisation." };
  redirect(tenantUrl(t.slug, "/login"));
}

const signupSchema = z.object({
  orgName: z.string().trim().min(2, "Enter your organisation name.").max(120),
  slug: z.string().trim().toLowerCase().refine(isValidSlug, "Use 3-32 lowercase letters, numbers or hyphens."),
  legalEntityName: z.string().trim().min(2, "Enter the legal entity name.").max(160),
  country: z.string().length(2),
  currency: z.string().length(3),
  timezone: z.string().min(3).max(64),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  jobTitle: z.string().trim().max(120),
  email: z.email("Enter a valid email."),
  password: z.string().min(10, "Use at least 10 characters for the password.").max(128),
});

export type SignupState = { error?: string; redirectTo?: string } | null;

export async function signupAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  if (!env.publicSignup) return { error: "Sign-up is closed. Contact sales to open an account." };
  if ((await currentTenant()) !== null) return { error: "Create organisations from the main Crewlane site." };
  try {
    const input = signupSchema.parse(Object.fromEntries(fd));
    const { slug } = await provisionTenant({
      orgName: input.orgName,
      slug: input.slug,
      legalEntityName: input.legalEntityName,
      country: input.country,
      currency: input.currency,
      timezone: input.timezone,
      primaryColor: input.primaryColor,
      admin: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: input.password,
        jobTitle: input.jobTitle,
      },
    });
    metrics.tenantsCreated.inc();
    log.info("tenant provisioned", { slug });
    return { redirectTo: tenantUrl(slug, "/login?welcome=1") };
  } catch (err) {
    return { error: userMessage(err) };
  }
}
