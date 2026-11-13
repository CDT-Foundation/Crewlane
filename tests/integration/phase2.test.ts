import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const enabled = Boolean(inject("databaseUrl"));

describe.skipIf(!enabled)("phase 2: assets, procurement, helpdesk, onboarding and offboarding", () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.WORKER_DATABASE_URL = inject("workerDatabaseUrl");
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
  process.env.ROOT_DOMAIN = "crewlane.test";
  process.env.CREWLANE_WORKER_AUTOSTART = "false";

  let s: typeof import("@/db/schema");
  let withTenant: typeof import("@/db/tenant").withTenant;
  let closePools: typeof import("@/db/client").closePools;
  let getPool: typeof import("@/db/client").getPool;
  let lib: {
    provision: typeof import("@/lib/provision");
    auth: typeof import("@/lib/auth");
    assets: typeof import("@/lib/assets");
    requests: typeof import("@/lib/asset-requests");
    procurement: typeof import("@/lib/procurement");
    workflows: typeof import("@/lib/workflows");
    delegations: typeof import("@/lib/delegations");
    helpdesk: typeof import("@/lib/helpdesk");
    gate: typeof import("@/lib/gatepass");
    telecom: typeof import("@/lib/telecom");
    discovery: typeof import("@/lib/discovery");
    scheduler: typeof import("@/worker/scheduler");
    worker: typeof import("@/worker/index");
    clearance: typeof import("@/lib/clearance");
  };

  let T: string; // tenant id
  const people: Record<string, { userId: string; employeeId: string }> = {};
  let laptopCat: string;

  async function person(key: string, roleKey: string | null, opts: { managerId?: string; gradeCode?: string } = {}) {
    const userId = await lib.auth.createLogin({ name: `${key} Person`, email: `${key}@p2.test`, password: `password-${key}-1` });
    const employeeId = await withTenant({ tenantId: T }, async (tx) => {
      const [g] = opts.gradeCode ? await tx.select().from(s.jobGrades).where(eq(s.jobGrades.code, opts.gradeCode)) : [];
      const [e] = await tx
        .insert(s.employees)
        .values({
          tenantId: T, employeeNo: `X-${key}`, firstName: key, lastName: "Person", status: "active",
          managerId: opts.managerId ?? null, jobGradeId: g?.id ?? null, personalEmail: `${key}.home@p2.test`,
        })
        .returning({ id: s.employees.id });
      const [m] = await tx.insert(s.memberships).values({ tenantId: T, userId, employeeId: e.id }).returning();
      if (roleKey) {
        const [r] = await tx.select().from(s.roles).where(eq(s.roles.key, roleKey));
        await tx.insert(s.membershipRoles).values({ tenantId: T, membershipId: m.id, roleId: r.id, scope: "company" });
      }
      return e.id;
    });
    people[key] = { userId, employeeId };
    return people[key];
  }

  const actor = (key: string) => ({ tenantId: T, userId: people[key].userId });
  const tx = <R,>(fn: Parameters<typeof withTenant<R>>[1]) => withTenant({ tenantId: T }, fn);
  async function drainWorker() {
    let n = 0;
    while (await lib.worker.processOne()) n++;
    return n;
  }

  beforeAll(async () => {
    s = await import("@/db/schema");
    ({ withTenant } = await import("@/db/tenant"));
    ({ closePools, getPool } = await import("@/db/client"));
    lib = {
      provision: await import("@/lib/provision"),
      auth: await import("@/lib/auth"),
      assets: await import("@/lib/assets"),
      requests: await import("@/lib/asset-requests"),
      procurement: await import("@/lib/procurement"),
      workflows: await import("@/lib/workflows"),
      delegations: await import("@/lib/delegations"),
      helpdesk: await import("@/lib/helpdesk"),
      gate: await import("@/lib/gatepass"),
      telecom: await import("@/lib/telecom"),
      discovery: await import("@/lib/discovery"),
      scheduler: await import("@/worker/scheduler"),
      worker: await import("@/worker/index"),
      clearance: await import("@/lib/clearance"),
    };
    const t = await lib.provision.provisionTenant({
      orgName: "Phase Two", slug: "phase-two", legalEntityName: "Phase Two Ltd", country: "LK", currency: "LKR",
      timezone: "Asia/Colombo", primaryColor: "#123456",
      admin: { firstName: "Olive", lastName: "Owner", email: "olive@p2.test", password: "password-olive-1", jobTitle: "CEO" },
    });
    T = t.tenantId;
    await drainWorker();
    const [ownerM] = await tx((t2) => t2.select().from(s.memberships));
    people.owner = { userId: ownerM.userId, employeeId: ownerM.employeeId! };
    await person("manny", "manager");
    await person("emma", "employee", { managerId: people.manny.employeeId, gradeCode: "G2" });
    await person("dana", "manager"); // covers for manny
    await person("fin", "finance_officer");
    await person("ivan", "it_manager");
    await person("agnes", "it_agent");
    await person("ali", "it_agent");
    await person("pat", "procurement_officer");
    await person("sam", "security_guard");
    [{ id: laptopCat }] = await tx((t2) => t2.select().from(s.assetCategories).where(eq(s.assetCategories.code, "LAP")));
  });

  afterAll(async () => {
    await closePools?.();
  });

  it("seeds Phase 2 defaults for new tenants", async () => {
    const r = await tx(async (t2) => ({
      roles: (await t2.select({ n: count() }).from(s.roles))[0].n,
      cats: (await t2.select({ n: count() }).from(s.assetCategories))[0].n,
      sla: (await t2.select({ n: count() }).from(s.slaPolicies))[0].n,
      ownerPerms: (await t2.select().from(s.roles).where(eq(s.roles.key, "owner")))[0].permissions.length,
    }));
    expect(r).toEqual({ roles: 9, cats: 8, sla: 4, ownerPerms: 24 });
  });

  it("routes an equipment request to the line manager, and to their delegate while on leave", async () => {
    const a = await tx((t2) =>
      lib.assets.createAsset(t2, actor("ivan"), { categoryId: laptopCat, name: "ThinkPad T14", serialNo: "SN-1", purchaseDate: "2026-01-15", purchaseCost: "360000", currency: "LKR" }),
    );
    expect(a.tag).toMatch(/^AST-\d{5}$/);

    const req = await tx((t2) =>
      lib.requests.createAssetRequest(t2, actor("emma"), {
        forEmployeeId: people.emma.employeeId, source: "self_service", reason: "New laptop",
        lines: [{ categoryId: laptopCat, description: "Laptop", quantity: 1, estimatedUnitCost: 360000 }],
      }),
    );
    const [ar] = await tx((t2) => t2.select().from(s.approvalRequests).where(eq(s.approvalRequests.subjectId, req.id)));
    expect(ar.steps[0].approverEmployeeId).toBe(people.manny.employeeId);

    // Manny goes on leave; Dana covers.
    await tx((t2) =>
      t2.insert(s.delegations).values({ tenantId: T, employeeId: people.manny.employeeId, delegateEmployeeId: people.dana.employeeId, startsOn: "2020-01-01", endsOn: "2099-01-01" }),
    );
    const acting = await tx((t2) => lib.delegations.actingFor(t2, people.dana.employeeId));
    expect(acting.employeeIds).toEqual([people.manny.employeeId]);

    // A random manager cannot decide; Dana (acting for Manny) can.
    await expect(
      tx((t2) => lib.workflows.decide(t2, actor("ivan"), { requestId: ar.id, decision: "approve", actorRoles: ["it_manager"], actorEmployeeIds: [people.ivan.employeeId] })),
    ).rejects.toThrow(/line manager/);
    await tx((t2) =>
      lib.workflows.decide(t2, actor("dana"), { requestId: ar.id, decision: "approve", actorRoles: ["manager"], actorEmployeeIds: [people.dana.employeeId, ...acting.employeeIds] }),
    );
    // Over 1,500 → second step for the IT manager.
    await tx((t2) => lib.workflows.decide(t2, actor("ivan"), { requestId: ar.id, decision: "approve", actorRoles: ["it_manager"] }));
    const [after] = await tx((t2) => t2.select().from(s.assetRequests).where(eq(s.assetRequests.id, req.id)));
    expect(after.status).toBe("fulfilled");
    const [laptop] = await tx((t2) => t2.select().from(s.assets).where(eq(s.assets.id, a.id)));
    expect(laptop.custodianEmployeeId).toBe(people.emma.employeeId);
    await tx((t2) => t2.delete(s.delegations));
  });

  it("buys what is out of stock: PO with maker-checker, goods receipt creates assets and fills the request", async () => {
    const req = await tx((t2) =>
      lib.requests.createAssetRequest(t2, actor("manny"), {
        forEmployeeId: people.emma.employeeId, source: "manager",
        lines: [{ categoryId: laptopCat, description: "Laptop", quantity: 2, estimatedUnitCost: 500 }],
      }),
    );
    // Manny raised it for his own report: as the maker he cannot approve the @manager step himself.
    const [ar] = await tx((t2) => t2.select().from(s.approvalRequests).where(eq(s.approvalRequests.subjectId, req.id)));
    await expect(
      tx((t2) => lib.workflows.decide(t2, actor("manny"), { requestId: ar.id, decision: "approve", actorRoles: ["manager"], actorEmployeeIds: [people.manny.employeeId] })),
    ).rejects.toThrow(/Maker-checker/);
    await tx((t2) => lib.workflows.decide(t2, actor("owner"), { requestId: ar.id, decision: "approve", actorRoles: ["owner"] }));
    const [r1] = await tx((t2) => t2.select().from(s.assetRequests).where(eq(s.assetRequests.id, req.id)));
    expect(r1.status).toBe("awaiting_stock");

    const [v] = await tx((t2) => t2.insert(s.vendors).values({ tenantId: T, name: "Abans Business" }).returning());
    const po = await tx((t2) =>
      lib.procurement.createPurchaseOrder(t2, actor("pat"), {
        vendorId: v.id, currency: "LKR", assetRequestId: req.id,
        lines: [{ categoryId: laptopCat, description: "Dell Latitude 5450", quantity: 2, unitCost: 410000 }],
      }),
    );
    expect(po.number).toBe("PO-00001");
    await tx((t2) => lib.procurement.submitPurchaseOrder(t2, actor("pat"), po.id));
    await expect(
      tx((t2) => lib.procurement.receiveGoods(t2, actor("pat"), { poId: po.id, lines: [] })),
    ).rejects.toThrow(/issued/);
    const [poAr] = await tx((t2) => t2.select().from(s.approvalRequests).where(eq(s.approvalRequests.subjectId, po.id)));
    await tx((t2) => lib.workflows.decide(t2, actor("fin"), { requestId: poAr.id, decision: "approve", actorRoles: ["finance_officer"] }));
    // 820,000 LKR is over the 500,000 threshold, so the owner signs too.
    const [mid] = await tx((t2) => t2.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.id, po.id)));
    expect(mid.status).toBe("pending_approval");
    await tx((t2) => lib.workflows.decide(t2, actor("owner"), { requestId: poAr.id, decision: "approve", actorRoles: ["owner"] }));
    const [issued] = await tx((t2) => t2.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.id, po.id)));
    expect(issued.status).toBe("issued");

    const [line] = await tx((t2) => t2.select().from(s.poLines).where(eq(s.poLines.poId, po.id)));
    const grn = await tx((t2) =>
      lib.procurement.receiveGoods(t2, actor("pat"), { poId: po.id, lines: [{ poLineId: line.id, quantity: 2, serials: ["DL-A", "DL-B"] }] }),
    );
    expect(grn.assets).toHaveLength(2);
    const [r2] = await tx((t2) => t2.select().from(s.assetRequests).where(eq(s.assetRequests.id, req.id)));
    expect(r2.status).toBe("fulfilled");
    const emmas = await tx((t2) => t2.select().from(s.assets).where(eq(s.assets.custodianEmployeeId, people.emma.employeeId)));
    expect(emmas.map((a) => a.serialNo).sort()).toEqual(["DL-A", "DL-B", "SN-1"]);
  });

  it("assigns tickets to the least-loaded agent and skips agents on leave", async () => {
    await tx((t2) =>
      t2.insert(s.delegations).values({ tenantId: T, employeeId: people.agnes.employeeId, delegateEmployeeId: people.ali.employeeId, startsOn: "2020-01-01", endsOn: "2099-01-01" }),
    );
    const t1 = await tx((t2) => lib.helpdesk.createTicket(t2, actor("emma"), { title: "VPN down", description: "x", category: "network", priority: "p1", requesterEmployeeId: people.emma.employeeId }));
    expect(t1.assigneeEmployeeId).not.toBe(people.agnes.employeeId);
    // Explicitly assigning to Agnes while she is away routes it to Ali.
    await tx((t2) => lib.helpdesk.updateTicket(t2, actor("ivan"), t1.id, { assigneeEmployeeId: people.agnes.employeeId }));
    const [routed] = await tx((t2) => t2.select().from(s.tickets).where(eq(s.tickets.id, t1.id)));
    expect(routed.assigneeEmployeeId).toBe(people.ali.employeeId);
    expect(routed.delegatedFromEmployeeId).toBe(people.agnes.employeeId);
    expect(t1.number).toMatch(/^T-\d{5}$/);
    expect(t1.resolveDueAt!.getTime() - t1.createdAt.getTime()).toBe(4 * 3600_000);

    // First public agent reply records the first response.
    await tx((t2) => lib.helpdesk.addComment(t2, actor("ali"), { ticketId: t1.id, body: "Looking", internal: false, asAgent: true }));
    const [after] = await tx((t2) => t2.select().from(s.tickets).where(eq(s.tickets.id, t1.id)));
    expect(after.firstResponseAt).not.toBeNull();
    expect(after.status).toBe("open");

    // Breach detection notifies once.
    const later = new Date(Date.now() + 5 * 3600_000);
    expect(await tx((t2) => lib.scheduler.slaBreaches(t2, T, later))).toBeGreaterThanOrEqual(1);
    expect(await tx((t2) => lib.scheduler.slaBreaches(t2, T, later))).toBe(0);
    await tx((t2) => t2.delete(s.delegations));
  });

  it("runs zero-touch onboarding from the employee.hired event", async () => {
    await tx(async (t2) => {
      await t2.insert(s.tenantIntegrations).values({ tenantId: T, provider: "google_workspace", mode: "simulator", config: { domain: "phase2.test", defaultGroups: "all@phase2.test" } });
      // Stock + kit for grade G2.
      const [g2] = await t2.select().from(s.jobGrades).where(eq(s.jobGrades.code, "G2"));
      await t2.insert(s.equipmentKits).values({ tenantId: T, jobGradeId: g2.id, name: "Executive kit", items: [{ categoryId: laptopCat, quantity: 1, description: "Laptop" }] });
    });
    await tx((t2) => lib.assets.createAsset(t2, actor("ivan"), { categoryId: laptopCat, name: "Spare laptop", currency: "LKR" }));
    const hire = await tx(async (t2) => {
      const [g2] = await t2.select().from(s.jobGrades).where(eq(s.jobGrades.code, "G2"));
      const [e] = await t2
        .insert(s.employees)
        .values({ tenantId: T, employeeNo: "H-1", firstName: "Nuwan", lastName: "Silva", status: "preboarding", jobGradeId: g2.id, personalEmail: "nuwan@home.test" })
        .returning();
      await t2.insert(s.outboxEvents).values({ tenantId: T, type: "employee.hired", payload: { employeeId: e.id } });
      return e;
    });
    await drainWorker();
    const res = await tx(async (t2) => ({
      ticket: (await t2.select().from(s.tickets).where(eq(s.tickets.externalRef, `onboarding:${hire.id}`)))[0],
      account: (await t2.select().from(s.identityAccounts).where(eq(s.identityAccounts.employeeId, hire.id)))[0],
      kit: (await t2.select().from(s.assetRequests).where(eq(s.assetRequests.forEmployeeId, hire.id)))[0],
      emp: (await t2.select().from(s.employees).where(eq(s.employees.id, hire.id)))[0],
    }));
    expect(res.ticket.category).toBe("onboarding");
    expect(res.account).toMatchObject({ status: "active", email: "nuwan.silva@phase2.test", groups: ["all@phase2.test"] });
    expect(res.kit).toMatchObject({ source: "onboarding", status: "fulfilled" });
    expect(res.emp.workEmail).toBe("nuwan.silva@phase2.test");

    // Running the same event again does nothing new.
    await tx((t2) => t2.insert(s.outboxEvents).values({ tenantId: T, type: "employee.hired", payload: { employeeId: hire.id } }));
    await drainWorker();
    const n = await tx(async (t2) => (await t2.select({ n: count() }).from(s.tickets).where(eq(s.tickets.externalRef, `onboarding:${hire.id}`)))[0].n);
    expect(n).toBe(1);
  });

  it("blocks final settlement until every asset, account and seat is cleared", async () => {
    const [hire] = await tx((t2) => t2.select().from(s.employees).where(eq(s.employees.employeeNo, "H-1")));
    const [sub] = await tx((t2) =>
      t2.insert(s.softwareSubscriptions).values({ tenantId: T, product: "Figma", seatsTotal: 1, costPerSeat: "6000", currency: "LKR", renewalDate: "2099-01-01" }).returning(),
    );
    await tx((t2) => import("@/lib/licences").then((m) => m.assignSeat(t2, actor("ivan"), sub.id, hire.id)));

    const started = await tx((t2) =>
      lib.workflows.startApproval(t2, actor("owner"), {
        trigger: "employee.status_change", title: "Resignation", subjectType: "employee", subjectId: hire.id,
        payload: { status: "resigned", exitDate: "2026-01-31", reason: "Moving abroad" },
      }),
    );
    const reqId = started.status === "pending" ? started.requestId : "";
    // Owner raised it, so an HR admin must approve. Make Fin an HR admin for this.
    await tx(async (t2) => {
      const [m] = await t2.select().from(s.memberships).where(eq(s.memberships.userId, people.fin.userId));
      const [r] = await t2.select().from(s.roles).where(eq(s.roles.key, "hr_admin"));
      await t2.insert(s.membershipRoles).values({ tenantId: T, membershipId: m.id, roleId: r.id, scope: "company" });
    });
    await tx((t2) => lib.workflows.decide(t2, actor("fin"), { requestId: reqId, decision: "approve", actorRoles: ["hr_admin"] }));

    let [c] = await tx((t2) => t2.select().from(s.clearances).where(eq(s.clearances.employeeId, hire.id)));
    expect(c).toMatchObject({ status: "open", settlementBlocked: true });
    const items = await tx((t2) => t2.select().from(s.clearanceItems).where(eq(s.clearanceItems.clearanceId, c.id)));
    expect(items.map((i) => i.type).sort()).toEqual(["account_revoke", "asset_return", "licence_reclaim"]);
    expect(await tx((t2) => lib.clearance.settlementBlocked(t2, hire.id))).toBe(true);

    // Laptop comes back with a signature.
    const asset = items.find((i) => i.type === "asset_return")!;
    await tx((t2) => lib.assets.returnAsset(t2, actor("agnes"), { assetId: asset.refId!, condition: "good", signatureName: "Nuwan Silva" }));
    // The exit date has passed: the scheduler suspends the account and reclaims the seat.
    const revoked = await tx((t2) => lib.scheduler.exitDayRevocations(t2, T, "2026-02-01"));
    expect(revoked).toBe(2);
    [c] = await tx((t2) => t2.select().from(s.clearances).where(eq(s.clearances.id, c.id)));
    expect(c).toMatchObject({ status: "cleared", settlementBlocked: false });
    const [acc] = await tx((t2) => t2.select().from(s.identityAccounts).where(eq(s.identityAccounts.employeeId, hire.id)));
    expect(acc.status).toBe("suspended");
  });

  it("charges the net book value of a lost asset to payroll", async () => {
    const a = await tx((t2) =>
      lib.assets.createAsset(t2, actor("ivan"), { categoryId: laptopCat, name: "Lost laptop", purchaseDate: "2025-01-01", purchaseCost: "360000", currency: "LKR" }),
    );
    await tx((t2) => lib.assets.assignAsset(t2, actor("ivan"), { assetId: a.id, employeeId: people.emma.employeeId, signatureName: "Emma Person" }));
    const r = await tx((t2) => lib.assets.markLost(t2, actor("ivan"), { assetId: a.id, charge: true }));
    expect(r.nbv).toBeGreaterThan(0);
    expect(r.nbv).toBeLessThan(360000);
    const [d] = await tx((t2) => t2.select().from(s.payrollDeductions).where(eq(s.payrollDeductions.id, r.deductionId!)));
    expect(d).toMatchObject({ source: "asset_loss", status: "pending", employeeId: people.emma.employeeId });
  });

  it("tracks returnable gate passes out, overdue and back in", async () => {
    const [anyAsset] = await tx((t2) => t2.select().from(s.assets).where(eq(s.assets.status, "in_stock")).limit(1));
    const { pass, token } = await tx((t2) =>
      lib.gate.issueGatePass(t2, actor("agnes"), {
        type: "returnable", assetId: anyAsset.id, description: "Laptop for repair", carrierName: "Courier", destination: "Dell service centre", expectedReturnOn: "2026-01-10",
      }),
    );
    const found = await tx((t2) => lib.gate.findPassByToken(t2, token));
    expect(found?.id).toBe(pass.id);
    await tx((t2) => lib.gate.scanGatePass(t2, actor("sam"), pass.id, "out"));
    await expect(tx((t2) => lib.gate.scanGatePass(t2, actor("sam"), pass.id, "out"))).rejects.toThrow(/cannot go out/);
    expect(await tx((t2) => lib.scheduler.overdueGatePasses(t2, T, "2026-02-01"))).toBe(1);
    await tx((t2) => lib.gate.scanGatePass(t2, actor("sam"), pass.id, "in"));
    const [p] = await tx((t2) => t2.select().from(s.gatePasses).where(eq(s.gatePasses.id, pass.id)));
    expect(p.status).toBe("returned");
  });

  it("splits telecom bills into allowance and personal excess", async () => {
    await tx((t2) => t2.insert(s.telecomLines).values({ tenantId: T, number: "0771234567", carrier: "Dialog", employeeId: people.emma.employeeId, monthlyAllowance: "3000" }));
    const rows = lib.telecom.parseBillCsv("number,amount\n077 123 4567,4250.50\n0719999999,100");
    const r = await tx((t2) => lib.telecom.importBills(t2, actor("fin"), "2026-10", rows));
    expect(r).toEqual({ imported: 1, unknown: ["0719999999"] });
    const [bill] = await tx((t2) => t2.select().from(s.telecomBills));
    expect(bill).toMatchObject({ excess: "1250.50", status: "pending_review" });
    await tx((t2) => lib.telecom.decideExcess(t2, actor("fin"), bill.id, "deduct", "LKR"));
    const [d] = await tx((t2) => t2.select().from(s.payrollDeductions).where(eq(s.payrollDeductions.source, "telecom_excess")));
    expect(d.amount).toBe("1250.50");
  });

  it("registers devices from the discovery agent and flags blocklisted software", async () => {
    await tx((t2) => t2.insert(s.softwareBlocklist).values({ tenantId: T, pattern: "utorrent" }));
    const report = lib.discovery.agentReportSchema.parse({
      hostname: "FIN-PC-07", serial: "NEW-SERIAL-1", manufacturer: "HP", model: "EliteBook", chassis: "laptop", ramGb: 16, software: ["Chrome", "uTorrent 3.6"],
    });
    const r = await tx((t2) => lib.discovery.processAgentReport(t2, T, "LKR", report));
    expect(r).toMatchObject({ status: "discovered", alerts: ["utorrent"] });
    const again = await tx((t2) => lib.discovery.processAgentReport(t2, T, "LKR", report));
    expect(again.status).toBe("updated");
    const n = await tx(async (t2) => (await t2.select({ n: count() }).from(s.tickets).where(sql`${s.tickets.externalRef} like 'agent:%'`))[0].n);
    expect(n).toBe(1);
  });

  it("keeps Phase 2 data inside the tenant", async () => {
    const other = await lib.provision.provisionTenant({
      orgName: "Other", slug: "other-co", legalEntityName: "Other Ltd", country: "LK", currency: "LKR", timezone: "Asia/Colombo", primaryColor: "#000000",
      admin: { firstName: "O", lastName: "T", email: "o@other.test", password: "password-other-1", jobTitle: "" },
    });
    const seen = await withTenant({ tenantId: other.tenantId }, async (t2) => ({
      assets: (await t2.select({ n: count() }).from(s.assets))[0].n,
      tickets: (await t2.select({ n: count() }).from(s.tickets))[0].n,
      deductions: (await t2.select({ n: count() }).from(s.payrollDeductions))[0].n,
    }));
    expect(seen).toEqual({ assets: 0, tickets: 0, deductions: 0 });
    const [someAsset] = await tx((t2) => t2.select().from(s.assets).limit(1));
    await expect(
      withTenant({ tenantId: other.tenantId }, (t2) =>
        t2.insert(s.gatePasses).values({ tenantId: other.tenantId, number: "X", type: "non_returnable", assetId: someAsset.id, description: "x", carrierName: "x", destination: "x", tokenHash: "x" }),
      ),
    ).rejects.toThrow();
    // Each tenant numbers its own documents from 1.
    const o = await withTenant({ tenantId: other.tenantId }, (t2) =>
      lib.helpdesk.createTicket(t2, { tenantId: other.tenantId, userId: null }, { title: "a", description: "b", category: "other" }),
    );
    expect(o.number).toBe("T-00001");
  });

  it("the scheduler runs once per tick across tenants", async () => {
    const r = await lib.scheduler.runSchedulerTick(getPool("WORKER_DATABASE_URL").db);
    expect(r.skipped).toBe(false);
    expect((r as { failedTenants: number }).failedTenants).toBe(0);
    void and;
  });
});
