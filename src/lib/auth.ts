import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { account, session, tenantDomains, user, verification } from "@/db/schema";
import { env } from "./env";
import { UserError } from "./errors";
import { classifyHost, stripPort } from "./hosts";

function createAuth() {
  const root = env.rootDomain;
  return betterAuth({
    appName: "Crewlane",
    secret: process.env.BETTER_AUTH_SECRET,
    // Every tenant has its own subdomain, so the base URL follows the request
    // host, restricted to the root domain and its subdomains.
    baseURL: {
      allowedHosts: [root, `*.${root}`],
      protocol: env.protocol,
      fallback: env.rootUrl,
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      // Accounts are created by the onboarding wizard or by an admin, never
      // by public sign-up on a tenant host.
      disableSignUp: true,
      minPasswordLength: 10,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    trustedOrigins: async (request) => {
      const origin = request?.headers.get("origin");
      if (!origin) return [];
      const host = new URL(origin).host;
      const kind = classifyHost(host, root);
      if (kind.kind !== "custom") return [origin];
      // Verified custom domains (e.g. hr.acme.com) are trusted too.
      const [row] = await getDb()
        .select({ id: tenantDomains.id })
        .from(tenantDomains)
        .where(and(eq(tenantDomains.domain, stripPort(host)), isNotNull(tenantDomains.verifiedAt)))
        .limit(1);
      return row ? [origin] : [];
    },
    advanced: {
      useSecureCookies: env.protocol === "https",
      cookiePrefix: "crewlane",
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __crewlaneAuth?: Auth };

export function getAuth(): Auth {
  return (globalForAuth.__crewlaneAuth ??= createAuth());
}

/**
 * Creates a login with an email + password credential without going through
 * the (disabled) public sign-up endpoint. Returns the user id.
 */
export async function createLogin(input: { name: string; email: string; password: string }) {
  const ctx = await getAuth().$context;
  const email = input.email.trim().toLowerCase();
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) throw new LoginExistsError(email);
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (input.password.length < minPasswordLength || input.password.length > maxPasswordLength) {
    throw new UserError(`Password must be ${minPasswordLength}-${maxPasswordLength} characters.`);
  }
  const hash = await ctx.password.hash(input.password);
  const created = await ctx.internalAdapter.createUser({ name: input.name, email }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });
  return created.id;
}

export async function deleteLogin(userId: string) {
  const ctx = await getAuth().$context;
  await ctx.internalAdapter.deleteUser(userId);
}

export class LoginExistsError extends UserError {
  constructor(email: string) {
    super(`An account already exists for ${email}.`);
  }
}
