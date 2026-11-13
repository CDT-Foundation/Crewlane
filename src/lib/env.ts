/**
 * Runtime configuration. Values are read lazily so `next build` does not need
 * production secrets.
 */
export const env = {
  /** Host (with port in dev) that tenant subdomains hang off, e.g. crewlane.app or localhost:3000 */
  get rootDomain(): string {
    return (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
  },
  get protocol(): "http" | "https" {
    const p = process.env.APP_PROTOCOL;
    if (p === "http" || p === "https") return p;
    return process.env.NODE_ENV === "production" ? "https" : "http";
  },
  get rootUrl(): string {
    return `${this.protocol}://${this.rootDomain}`;
  },
  /** Allow anyone to create an organisation from the root domain. */
  get publicSignup(): boolean {
    return (process.env.PUBLIC_SIGNUP ?? "true") === "true";
  },
};
