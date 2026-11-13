/**
 * Identity providers: Google Workspace (Admin SDK Directory API) and
 * Microsoft 365 (Graph). Each tenant chooses "simulator" or "live" per
 * provider in Settings → Integrations. The simulator lets the whole
 * provisioning flow run in development and tests without real tenants.
 */
import { createSign } from "node:crypto";

export type NewAccount = {
  givenName: string;
  familyName: string;
  primaryEmail: string;
  password: string;
  department?: string | null;
  jobTitle?: string | null;
};

export interface IdentityProvider {
  readonly name: "google_workspace" | "microsoft_365";
  createUser(a: NewAccount): Promise<{ externalId: string }>;
  addToGroups(externalId: string, groups: string[]): Promise<void>;
  suspend(externalId: string): Promise<void>;
  resetPassword(externalId: string, password: string): Promise<void>;
  revokeSessions(externalId: string): Promise<void>;
}

export type ProviderConfig = {
  mode: "simulator" | "live";
  config: Record<string, string>;
  secret: string | null;
};

/* ---------------------------- simulator --------------------------- */

export class SimulatedIdentityProvider implements IdentityProvider {
  constructor(readonly name: "google_workspace" | "microsoft_365") {}
  readonly calls: { op: string; args: unknown }[] = [];
  async createUser(a: NewAccount) {
    this.calls.push({ op: "createUser", args: { ...a, password: "***" } });
    if (a.primaryEmail.includes("fail-provisioning")) throw new Error("Simulated provider error");
    return { externalId: `sim-${this.name}-${a.primaryEmail}` };
  }
  async addToGroups(externalId: string, groups: string[]) {
    this.calls.push({ op: "addToGroups", args: { externalId, groups } });
  }
  async suspend(externalId: string) {
    this.calls.push({ op: "suspend", args: { externalId } });
  }
  async resetPassword(externalId: string) {
    this.calls.push({ op: "resetPassword", args: { externalId } });
  }
  async revokeSessions(externalId: string) {
    this.calls.push({ op: "revokeSessions", args: { externalId } });
  }
}

/* -------------------------- Google Workspace ----------------------- */

/**
 * Uses a service account with domain-wide delegation.
 * config: { domain, adminEmail }   secret: service-account JSON key.
 */
export class GoogleWorkspaceProvider implements IdentityProvider {
  readonly name = "google_workspace" as const;
  private token: { value: string; exp: number } | null = null;
  constructor(private cfg: ProviderConfig) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const key = JSON.parse(this.cfg.secret ?? "{}") as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
      iss: key.client_email,
      sub: this.cfg.config.adminEmail,
      scope: "https://www.googleapis.com/auth/admin.directory.user https://www.googleapis.com/auth/admin.directory.group",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`https://admin.googleapis.com/admin/directory/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 409) throw new Error(`Google ${method} ${path} failed ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  async createUser(a: NewAccount) {
    const u = (await this.call("POST", "/users", {
      primaryEmail: a.primaryEmail,
      name: { givenName: a.givenName, familyName: a.familyName },
      password: a.password,
      changePasswordAtNextLogin: true,
      organizations: [{ title: a.jobTitle ?? undefined, department: a.department ?? undefined, primary: true }],
    })) as { id: string } | null;
    return { externalId: u?.id ?? a.primaryEmail };
  }
  async addToGroups(externalId: string, groups: string[]) {
    for (const g of groups) await this.call("POST", `/groups/${encodeURIComponent(g)}/members`, { id: externalId, role: "MEMBER" });
  }
  async suspend(externalId: string) {
    await this.call("PUT", `/users/${encodeURIComponent(externalId)}`, { suspended: true });
  }
  async resetPassword(externalId: string, password: string) {
    await this.call("PUT", `/users/${encodeURIComponent(externalId)}`, { password, changePasswordAtNextLogin: true });
  }
  async revokeSessions(externalId: string) {
    await this.call("POST", `/users/${encodeURIComponent(externalId)}/signOut`);
  }
}

/* -------------------------- Microsoft 365 -------------------------- */

/**
 * Microsoft Graph with an Entra ID app registration (client credentials).
 * config: { tenantId, clientId, usageLocation? }   secret: client secret.
 * Needs User.ReadWrite.All and GroupMember.ReadWrite.All (application).
 */
export class Microsoft365Provider implements IdentityProvider {
  readonly name = "microsoft_365" as const;
  private token: { value: string; exp: number } | null = null;
  constructor(private cfg: ProviderConfig) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`https://login.microsoftonline.com/${this.cfg.config.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cfg.config.clientId,
        client_secret: this.cfg.secret ?? "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) throw new Error(`Microsoft token error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Graph ${method} ${path} failed ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  async createUser(a: NewAccount) {
    const u = (await this.call("POST", "/users", {
      accountEnabled: true,
      displayName: `${a.givenName} ${a.familyName}`,
      givenName: a.givenName,
      surname: a.familyName,
      mailNickname: a.primaryEmail.split("@")[0],
      userPrincipalName: a.primaryEmail,
      jobTitle: a.jobTitle ?? undefined,
      department: a.department ?? undefined,
      usageLocation: this.cfg.config.usageLocation || "LK",
      passwordProfile: { password: a.password, forceChangePasswordNextSignIn: true },
    })) as { id: string };
    return { externalId: u.id };
  }
  async addToGroups(externalId: string, groups: string[]) {
    for (const g of groups) {
      await this.call("POST", `/groups/${g}/members/$ref`, {
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${externalId}`,
      });
    }
  }
  async suspend(externalId: string) {
    await this.call("PATCH", `/users/${externalId}`, { accountEnabled: false });
  }
  async resetPassword(externalId: string, password: string) {
    await this.call("PATCH", `/users/${externalId}`, { passwordProfile: { password, forceChangePasswordNextSignIn: true } });
  }
  async revokeSessions(externalId: string) {
    await this.call("POST", `/users/${externalId}/revokeSignInSessions`);
  }
}

export function identityProvider(name: "google_workspace" | "microsoft_365", cfg: ProviderConfig): IdentityProvider {
  if (cfg.mode === "simulator") return new SimulatedIdentityProvider(name);
  return name === "google_workspace" ? new GoogleWorkspaceProvider(cfg) : new Microsoft365Provider(cfg);
}
