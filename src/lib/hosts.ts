/** Pure helpers for mapping a request host to a tenant. No I/O here. */

export type HostKind =
  | { kind: "root" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; domain: string };

export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "auth", "mail", "smtp", "status", "docs",
  "static", "assets", "cdn", "help", "support", "billing", "crewlane",
]);

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !slug.includes("--") && !RESERVED_SLUGS.has(slug);
}

export function classifyHost(rawHost: string, rootDomain: string): HostKind {
  const host = stripPort(rawHost.trim().toLowerCase());
  const root = stripPort(rootDomain.trim().toLowerCase());
  if (host === root || host === `www.${root}`) return { kind: "root" };
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (SLUG_RE.test(sub)) return { kind: "subdomain", slug: sub };
  }
  return { kind: "custom", domain: host };
}

export function isValidCustomDomain(domain: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
}

export function tenantOrigin(slug: string, rootDomain: string, protocol: string): string {
  return `${protocol}://${slug}.${rootDomain}`;
}
