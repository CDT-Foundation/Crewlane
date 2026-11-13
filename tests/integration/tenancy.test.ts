import { and, count, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const enabled = Boolean(inject("databaseUrl"));

describe.skipIf(!enabled)("multi-tenant core (real Postgres)", () => {
  // Modules read env lazily, so set it before first use.
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.WORKER_DATABASE_URL = inject("workerDatabaseUrl");
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
  process.env.ROOT_DOMAIN = "crewlane.test";
  process.env.CREWLANE_WORKER_AUTOSTART = "false";

  let s: typeof import("@/db/schema");
  let withTenant: typeof import("@/db/tenant").withTenant;
  let getDb: typeof import("@/db/client").getDb;
  let closePools: typeof import("@/db/client").closePools;
  let provisionTenant: typeof import("@/lib/provision").provisionTenant;
  let workflows: typeof import("@/lib/workflows");
  let employeeScopeFilter: typeof import("@/lib/employees").employeeScopeFilter;
  let createLogin: typeof import("@/lib/auth").createLogin;

  let a: { tenantId: string; slug: string };
  let b: { tenantId: string; slug: string };
  let ownerA: string;
  let financeA: string;
  let empA: string;

  beforeAll(async () => {
    s = await import("@/db/schema");
    ({ withTenant } = await import("@/db/tenant"));
    ({ getDb, closePools } = await import("@/db/client"));
    ({ provisionTenant } = await import("@/lib/provision"));
    workflows = await import("@/lib/workflows");
    ({ employeeScopeFilter } = await import("@/lib/employees"));
    ({ createLogin } = await import("@/lib/auth"));

    const base = { country: "LK", currency: "LKR", timezone: "Asia/Colombo", primaryColor: "#123456" };
    a = await provisionTenant({
      ...base, orgName: "Acme", slug: "acme", legalEntityName: "Acme (Pvt) Ltd",
      admin: { firstName: "Ann", lastName: "Owner", email: "ann@acme.test", password: "password-ann-1", jobTitle: "CEO" },
    });
    b = await provisionTenant({
      ...base, orgName: "Beta", slug: "beta", legalEntityName: "Beta Ltd",
      admin: { firstName: "Bob", lastName: "Owner", email: "bob@beta.test", password: "password-bob-1", jobTitle: "CEO" },
    });

    const [ownerRow] = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select({ userId: s.memberships.userId, employeeId: s.memberships.employeeId }).from(s.memberships),
    );
    ownerA = ownerRow.userId;

    // A second officer in tenant A with the finance_officer role.
    financeA = await createLogin({ name: "Fiona Finance", email: "fiona@acme.test", password: "password-fiona" });
    empA = await withTenant({ tenantId: a.tenantId }, async (tx) => {
      const [e] = await tx
        .insert(s.employees)
        .values({ tenantId: a.tenantId, employeeNo: "E0002", firstName: "Fiona", lastName: "Finance", status: "active", managerId: ownerRow.employeeId })
        .returning({ id: s.employees.id });
      const [m] = await tx.insert(s.memberships).values({ tenantId: a.tenantId, userId: financeA, employeeId: e.id }).returning();
      const [r] = await tx.select().from(s.roles).where(eq(s.roles.key, "finance_officer"));
      await tx.insert(s.membershipRoles).values({ tenantId: a.tenantId, membershipId: m.id, roleId: r.id, scope: "company" });
      return e.id;
    });
  });

  afterAll(async () => {
    await closePools?.();
  });

  it("provisions default roles, grades, templates and workflows per tenant", async () => {
    const counts = await withTenant({ tenantId: a.tenantId }, async (tx) => ({
      roles: (await tx.select({ n: count() }).from(s.roles))[0].n,
      grades: (await tx.select({ n: count() }).from(s.jobGrades))[0].n,
      templates: (await tx.select({ n: count() }).from(s.letterTemplates))[0].n,
      workflows: (await tx.select({ n: count() }).from(s.workflows))[0].n,
    }));
    expect(counts).toEqual({ roles: 9, grades: 6, templates: 4, workflows: 4 });
  });

  it("each tenant sees only its own rows", async () => {
    const inA = await withTenant({ tenantId: a.tenantId }, (tx) => tx.select().from(s.employees));
    const inB = await withTenant({ tenantId: b.tenantId }, (tx) => tx.select().from(s.employees));
    expect(inA.map((e) => e.tenantId).every((t) => t === a.tenantId)).toBe(true);
    expect(inB.map((e) => e.tenantId).every((t) => t === b.tenantId)).toBe(true);
    expect(inA).toHaveLength(2);
    expect(inB).toHaveLength(1);

    // Even an explicit WHERE on another tenant's id returns nothing.
    const peek = await withTenant({ tenantId: b.tenantId }, (tx) =>
      tx.select().from(s.employees).where(eq(s.employees.tenantId, a.tenantId)),
    );
    expect(peek).toHaveLength(0);
  });

  it("returns nothing when no tenant context is set (fails closed)", async () => {
    const rows = await getDb().select().from(s.employees);
    expect(rows).toHaveLength(0);
    const audit = await getDb().select().from(s.auditLog);
    expect(audit).toHaveLength(0);
  });

  it("rejects writes into another tenant", async () => {
    await expect(
      withTenant({ tenantId: b.tenantId }, (tx) =>
        tx.insert(s.employees).values({ tenantId: a.tenantId, employeeNo: "X1", firstName: "Evil", lastName: "Insert" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects references to another tenant's rows", async () => {
    const [unitA] = await withTenant({ tenantId: a.tenantId }, (tx) => tx.select().from(s.orgUnits));
    await expect(
      withTenant({ tenantId: b.tenantId }, (tx) =>
        tx.insert(s.employees).values({ tenantId: b.tenantId, employeeNo: "X2", firstName: "A", lastName: "B", orgUnitId: unitA.id }),
      ),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/cross-tenant/) }) });
  });

  it("enforces maker-checker in the app and in the database", async () => {
    const actor = { tenantId: a.tenantId, userId: ownerA };
    const started = await withTenant({ tenantId: a.tenantId, userId: ownerA }, (tx) =>
      workflows.startApproval(tx, actor, {
        trigger: "employee.bank_change", title: "Bank change", subjectType: "employee", subjectId: empA,
        payload: { bankName: "Commercial Bank", bankAccount: "1234567890" },
      }),
    );
    expect(started.status).toBe("pending");
    const requestId = started.status === "pending" ? started.requestId : "";

    // The requester (even an owner) cannot approve.
    await expect(
      withTenant({ tenantId: a.tenantId }, (tx) =>
        workflows.decide(tx, actor, { requestId, decision: "approve", actorRoles: ["owner"] }),
      ),
    ).rejects.toThrow(/Maker-checker/);

    // Bypassing the app and writing the decision row directly is blocked too.
    await expect(
      withTenant({ tenantId: a.tenantId }, (tx) =>
        tx.insert(s.approvalActions).values({ tenantId: a.tenantId, requestId, step: 0, actorUserId: ownerA, decision: "approve" }),
      ),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "42501" }) });

    // A different officer with the right role approves; the change is applied.
    await withTenant({ tenantId: a.tenantId }, (tx) =>
      workflows.decide(tx, { tenantId: a.tenantId, userId: financeA }, { requestId, decision: "approve", actorRoles: ["finance_officer"] }),
    );
    const [emp] = await withTenant({ tenantId: a.tenantId }, (tx) => tx.select().from(s.employees).where(eq(s.employees.id, empA)));
    expect(emp.bankAccount).toBe("1234567890");
    const [req] = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, requestId)),
    );
    expect(req.status).toBe("approved");
  });

  it("keeps the audit log append-only with an intact hash chain", async () => {
    const result = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.execute<{ checked: string; first_broken_seq: string | null }>(sql`select * from audit_verify_chain()`),
    );
    expect(Number(result[0].checked)).toBeGreaterThan(2);
    expect(result[0].first_broken_seq).toBeNull();

    await expect(
      withTenant({ tenantId: a.tenantId }, (tx) => tx.update(s.auditLog).set({ action: "tampered" })),
    ).rejects.toThrow();

    // Even the schema owner is stopped by the trigger.
    const owner = postgres(inject("ownerDatabaseUrl")!, { max: 1, onnotice: () => {} });
    try {
      await expect(owner`update audit_log set action = 'tampered'`).rejects.toThrow(/append-only/);
      await expect(owner`delete from audit_log`).rejects.toThrow(/append-only/);
    } finally {
      await owner.end();
    }
  });

  it("narrows the directory to direct reports for the reports scope", async () => {
    const [owner] = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select().from(s.memberships).where(eq(s.memberships.userId, ownerA)),
    );
    const visibleToOwner = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select({ id: s.employees.id }).from(s.employees).where(employeeScopeFilter("reports", owner.employeeId)),
    );
    expect(visibleToOwner).toHaveLength(2); // self + Fiona, who reports to Ann
    const visibleToFiona = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select({ id: s.employees.id }).from(s.employees).where(employeeScopeFilter("reports", empA)),
    );
    expect(visibleToFiona.map((r) => r.id)).toEqual([empA]);
    const selfOnly = await withTenant({ tenantId: a.tenantId }, (tx) =>
      tx.select({ id: s.employees.id }).from(s.employees).where(and(employeeScopeFilter("self", null))),
    );
    expect(selfOnly).toHaveLength(0);
  });

  it("the worker drains the outbox across tenants", async () => {
    const { processOne } = await import("@/worker/index");
    let n = 0;
    while (await processOne()) n++;
    expect(n).toBeGreaterThan(0);
    const owner = postgres(inject("ownerDatabaseUrl")!, { max: 1, onnotice: () => {} });
    try {
      const [{ pending }] = await owner<{ pending: number }[]>`select count(*)::int as pending from outbox_events where processed_at is null`;
      expect(pending).toBe(0);
    } finally {
      await owner.end();
    }
  });
});
