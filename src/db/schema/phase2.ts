/**
 * Phase 2: assets, procurement, gate passes, IT service desk, identity
 * provisioning, licences, telecom, onboarding/offboarding gate. Every table
 * here is tenant-scoped and protected by RLS (drizzle/0003_phase2_security.sql).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { approvalRequests, employees, orgUnits, tenants } from "./core";

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/* ---------------------------- Shared ------------------------------ */

/** Per-tenant document numbering (AST-00001, PO-00001, T-00001, ...). */
export const tenantCounters = pgTable(
  "tenant_counters",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.tenantId, t.userId, t.readAt)],
);

/** Integration settings per tenant. Secrets are AES-256-GCM encrypted. */
export const integrationProvider = pgEnum("integration_provider", [
  "google_workspace",
  "microsoft_365",
  "smtp",
  "inbound_webhook",
  "device_agent",
  "intune",
]);

export const tenantIntegrations = pgTable(
  "tenant_integrations",
  {
    id: id(),
    tenantId: tenantId(),
    provider: integrationProvider("provider").notNull(),
    mode: text("mode", { enum: ["simulator", "live"] }).notNull().default("simulator"),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    secretCiphertext: text("secret_ciphertext"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenant_integrations_uq").on(t.tenantId, t.provider)],
);

/** Out-of-office / acting officer. Phase 3 leave creates these automatically. */
export const delegations = pgTable(
  "delegations",
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    delegateEmployeeId: uuid("delegate_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason"),
    source: text("source", { enum: ["manual", "leave"] }).notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("delegations_active_idx").on(t.tenantId, t.employeeId, t.startsOn, t.endsOn)],
);

/** Amounts payroll must deduct (Phase 3 consumes these). */
export const payrollDeductions = pgTable(
  "payroll_deductions",
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["asset_loss", "telecom_excess", "canteen", "loan", "expense_recovery", "other"] }).notNull(),
    reference: text("reference").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["pending", "applied", "waived"] }).notNull().default("pending"),
    appliedPeriod: text("applied_period"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("payroll_deductions_emp_idx").on(t.tenantId, t.employeeId, t.status)],
);

/* ----------------------------- Assets ----------------------------- */

export const depreciationMethod = pgEnum("depreciation_method", ["straight_line", "written_down_value"]);

export const assetCategories = pgTable(
  "asset_categories",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    method: depreciationMethod("method").notNull().default("straight_line"),
    usefulLifeMonths: integer("useful_life_months").notNull().default(36),
    /** Annual rate in percent, for written-down-value. */
    wdvRate: numeric("wdv_rate", { precision: 5, scale: 2 }).notNull().default("25"),
    itManaged: boolean("it_managed").notNull().default(true),
  },
  (t) => [uniqueIndex("asset_categories_code_uq").on(t.tenantId, t.code)],
);

export const vendors = pgTable("vendors", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxNo: text("tax_no"),
  address: text("address"),
  rating: integer("rating"),
  createdAt: createdAt(),
});

export const assetStatus = pgEnum("asset_status", ["in_stock", "assigned", "in_repair", "lost", "disposed"]);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    tenantId: tenantId(),
    tag: text("tag").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => assetCategories.id),
    name: text("name").notNull(),
    make: text("make"),
    model: text("model"),
    serialNo: text("serial_no"),
    rfid: text("rfid"),
    status: assetStatus("status").notNull().default("in_stock"),
    condition: text("condition", { enum: ["new", "good", "fair", "poor", "damaged"] }).notNull().default("new"),
    locationUnitId: uuid("location_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
    custodianEmployeeId: uuid("custodian_employee_id").references(() => employees.id, { onDelete: "set null" }),
    purchaseDate: date("purchase_date"),
    purchaseCost: money("purchase_cost").notNull().default("0"),
    salvageValue: money("salvage_value").notNull().default("0"),
    currency: text("currency").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    warrantyUntil: date("warranty_until"),
    poLineId: uuid("po_line_id"),
    specs: jsonb("specs").$type<Record<string, unknown>>(),
    software: jsonb("software").$type<string[]>(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    notes: text("notes"),
    disposedAt: date("disposed_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assets_tag_uq").on(t.tenantId, t.tag),
    index("assets_serial_idx").on(t.tenantId, t.serialNo),
    index("assets_custodian_idx").on(t.tenantId, t.custodianEmployeeId),
  ],
);

export const assetEventType = pgEnum("asset_event_type", [
  "created", "assigned", "returned", "repair_out", "repair_in", "lost", "disposed", "gate_out", "gate_in", "discovered", "updated",
]);

export const assetEvents = pgTable(
  "asset_events",
  {
    id: id(),
    tenantId: tenantId(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: assetEventType("type").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id),
    condition: text("condition"),
    /** Typed full name of the person signing the handover/return form. */
    signatureName: text("signature_name"),
    signatureHash: text("signature_hash"),
    notes: text("notes"),
    /** Set when the asset was allocated to fill an equipment request. */
    requestId: uuid("request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("asset_events_asset_idx").on(t.tenantId, t.assetId), index("asset_events_request_idx").on(t.tenantId, t.requestId)],
);

/** Role-based equipment kits issued on hire, by job grade. */
export const equipmentKits = pgTable(
  "equipment_kits",
  {
    id: id(),
    tenantId: tenantId(),
    jobGradeId: uuid("job_grade_id"),
    name: text("name").notNull(),
    items: jsonb("items").$type<{ categoryId: string; quantity: number; description: string }[]>().notNull(),
  },
  (t) => [uniqueIndex("equipment_kits_grade_uq").on(t.tenantId, t.jobGradeId)],
);

/* -------------------------- Procurement --------------------------- */

export const assetRequestStatus = pgEnum("asset_request_status", [
  "pending_approval", "approved", "rejected", "awaiting_stock", "fulfilled", "cancelled",
]);

export const assetRequests = pgTable("asset_requests", {
  id: id(),
  tenantId: tenantId(),
  number: text("number").notNull(),
  forEmployeeId: uuid("for_employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").references(() => user.id),
  reason: text("reason"),
  source: text("source", { enum: ["self_service", "onboarding", "manager"] }).notNull().default("self_service"),
  status: assetRequestStatus("status").notNull().default("pending_approval"),
  estimatedTotal: money("estimated_total").notNull().default("0"),
  approvalRequestId: uuid("approval_request_id").references(() => approvalRequests.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const assetRequestLines = pgTable("asset_request_lines", {
  id: id(),
  tenantId: tenantId(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => assetRequests.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => assetCategories.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  estimatedUnitCost: money("estimated_unit_cost").notNull().default("0"),
  fulfilledQty: integer("fulfilled_qty").notNull().default(0),
});

export const poStatus = pgEnum("po_status", [
  "draft", "pending_approval", "issued", "partially_received", "received", "cancelled", "rejected",
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  tenantId: tenantId(),
  number: text("number").notNull(),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id),
  assetRequestId: uuid("asset_request_id").references(() => assetRequests.id, { onDelete: "set null" }),
  status: poStatus("status").notNull().default("draft"),
  currency: text("currency").notNull(),
  quoteRef: text("quote_ref"),
  total: money("total").notNull().default("0"),
  notes: text("notes"),
  approvalRequestId: uuid("approval_request_id").references(() => approvalRequests.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => user.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const poLines = pgTable("po_lines", {
  id: id(),
  tenantId: tenantId(),
  poId: uuid("po_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => assetCategories.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  receivedQty: integer("received_qty").notNull().default(0),
});

export const goodsReceipts = pgTable("goods_receipts", {
  id: id(),
  tenantId: tenantId(),
  number: text("number").notNull(),
  poId: uuid("po_id")
    .notNull()
    .references(() => purchaseOrders.id),
  receivedBy: text("received_by").references(() => user.id),
  notes: text("notes"),
  lines: jsonb("lines").$type<{ poLineId: string; quantity: number; serials: string[] }[]>().notNull(),
  createdAt: createdAt(),
});

/* --------------------------- Gate passes -------------------------- */

export const gatePassStatus = pgEnum("gate_pass_status", ["approved", "out", "returned", "closed", "cancelled"]);

export const gatePasses = pgTable(
  "gate_passes",
  {
    id: id(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    type: text("type", { enum: ["returnable", "non_returnable"] }).notNull(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    carrierName: text("carrier_name").notNull(),
    carrierEmployeeId: uuid("carrier_employee_id").references(() => employees.id, { onDelete: "set null" }),
    destination: text("destination").notNull(),
    reason: text("reason"),
    expectedReturnOn: date("expected_return_on"),
    status: gatePassStatus("status").notNull().default("approved"),
    tokenHash: text("token_hash").notNull(),
    issuedBy: text("issued_by").references(() => user.id),
    outAt: timestamp("out_at", { withTimezone: true }),
    outBy: text("out_by").references(() => user.id),
    inAt: timestamp("in_at", { withTimezone: true }),
    inBy: text("in_by").references(() => user.id),
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("gate_passes_token_uq").on(t.tokenHash), index("gate_passes_status_idx").on(t.tenantId, t.status)],
);

/* --------------------------- Service desk ------------------------- */

export const ticketPriority = pgEnum("ticket_priority", ["p1", "p2", "p3", "p4"]);
export const ticketStatus = pgEnum("ticket_status", ["new", "open", "in_progress", "waiting", "resolved", "closed"]);
export const ticketChannel = pgEnum("ticket_channel", ["portal", "email", "teams", "slack", "whatsapp", "kiosk", "system"]);

export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: id(),
    tenantId: tenantId(),
    priority: ticketPriority("priority").notNull(),
    responseMinutes: integer("response_minutes").notNull(),
    resolveMinutes: integer("resolve_minutes").notNull(),
  },
  (t) => [uniqueIndex("sla_policies_uq").on(t.tenantId, t.priority)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category", {
      enum: ["hardware", "software", "access", "network", "email", "onboarding", "offboarding", "facilities", "other"],
    }).notNull(),
    priority: ticketPriority("priority").notNull().default("p3"),
    status: ticketStatus("status").notNull().default("new"),
    channel: ticketChannel("channel").notNull().default("portal"),
    requesterEmployeeId: uuid("requester_employee_id").references(() => employees.id, { onDelete: "set null" }),
    requesterContact: text("requester_contact"),
    assigneeEmployeeId: uuid("assignee_employee_id").references(() => employees.id, { onDelete: "set null" }),
    /** Set when routing skipped someone on leave. */
    delegatedFromEmployeeId: uuid("delegated_from_employee_id").references(() => employees.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }),
    resolveDueAt: timestamp("resolve_due_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    breachNotifiedAt: timestamp("breach_notified_at", { withTimezone: true }),
    csat: integer("csat"),
    csatComment: text("csat_comment"),
    externalRef: text("external_ref"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tickets_number_uq").on(t.tenantId, t.number),
    index("tickets_status_idx").on(t.tenantId, t.status),
    index("tickets_assignee_idx").on(t.tenantId, t.assigneeEmployeeId),
  ],
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    id: id(),
    tenantId: tenantId(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id),
    authorLabel: text("author_label"),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_comments_ticket_idx").on(t.tenantId, t.ticketId)],
);

/* ------------------------ Identity accounts ----------------------- */

export const identityAccounts = pgTable(
  "identity_accounts",
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google_workspace", "microsoft_365"] }).notNull(),
    externalId: text("external_id"),
    email: text("email").notNull(),
    status: text("status", { enum: ["pending", "active", "suspended", "deleted", "error"] }).notNull().default("pending"),
    groups: text("groups").array().notNull().default(sql`'{}'::text[]`),
    lastAction: text("last_action"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("identity_accounts_uq").on(t.tenantId, t.provider, t.employeeId)],
);

/* --------------------------- Licences ----------------------------- */

export const softwareSubscriptions = pgTable("software_subscriptions", {
  id: id(),
  tenantId: tenantId(),
  vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  product: text("product").notNull(),
  plan: text("plan"),
  billingCycle: text("billing_cycle", { enum: ["monthly", "annual"] }).notNull().default("annual"),
  seatsTotal: integer("seats_total").notNull(),
  costPerSeat: money("cost_per_seat").notNull(),
  currency: text("currency").notNull(),
  renewalDate: date("renewal_date").notNull(),
  autoRenew: boolean("auto_renew").notNull().default(true),
  costUnitId: uuid("cost_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
  ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id, { onDelete: "set null" }),
  /** Which reminder windows (30/14/7) have already been sent for this renewal date. */
  remindersSent: integer("reminders_sent").array().notNull().default(sql`'{}'::int[]`),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const licenceAssignments = pgTable(
  "licence_assignments",
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => softwareSubscriptions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("licence_assignments_sub_idx").on(t.tenantId, t.subscriptionId)],
);

export const vendorInvoices = pgTable("vendor_invoices", {
  id: id(),
  tenantId: tenantId(),
  vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => softwareSubscriptions.id, { onDelete: "set null" }),
  poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
  invoiceNo: text("invoice_no").notNull(),
  amount: money("amount").notNull(),
  currency: text("currency").notNull(),
  issuedOn: date("issued_on").notNull(),
  dueOn: date("due_on"),
  costUnitId: uuid("cost_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
});

/* ---------------------------- Telecom ----------------------------- */

export const telecomLines = pgTable(
  "telecom_lines",
  {
    id: id(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    carrier: text("carrier").notNull(),
    plan: text("plan"),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    monthlyAllowance: money("monthly_allowance").notNull().default("0"),
    costUnitId: uuid("cost_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("telecom_lines_number_uq").on(t.tenantId, t.number)],
);

export const telecomBills = pgTable(
  "telecom_bills",
  {
    id: id(),
    tenantId: tenantId(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => telecomLines.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // YYYY-MM
    amount: money("amount").notNull(),
    allowance: money("allowance").notNull(),
    excess: money("excess").notNull(),
    status: text("status", { enum: ["within_allowance", "pending_review", "deduction_raised", "waived"] }).notNull(),
    deductionId: uuid("deduction_id").references(() => payrollDeductions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("telecom_bills_uq").on(t.tenantId, t.lineId, t.period)],
);

/* ------------------------ Offboarding gate ------------------------ */

export const clearances = pgTable(
  "clearances",
  {
    id: id(),
    tenantId: tenantId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["open", "cleared", "overridden"] }).notNull().default("open"),
    /** While true, payroll must not release final settlement or gratuity. */
    settlementBlocked: boolean("settlement_blocked").notNull().default(true),
    exitDate: date("exit_date"),
    overrideReason: text("override_reason"),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("clearances_employee_uq").on(t.tenantId, t.employeeId)],
);

export const clearanceItems = pgTable(
  "clearance_items",
  {
    id: id(),
    tenantId: tenantId(),
    clearanceId: uuid("clearance_id")
      .notNull()
      .references(() => clearances.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["asset_return", "account_revoke", "licence_reclaim", "gate_pass", "telecom_line", "custom"] }).notNull(),
    refId: uuid("ref_id"),
    description: text("description").notNull(),
    status: text("status", { enum: ["pending", "done", "waived", "lost"] }).notNull().default("pending"),
    deductionId: uuid("deduction_id").references(() => payrollDeductions.id, { onDelete: "set null" }),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("clearance_items_idx").on(t.tenantId, t.clearanceId)],
);

/* ------------------------- Device agent --------------------------- */

export const agentTokens = pgTable("agent_tokens", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Software names that should trigger an alert when the agent reports them. */
export const softwareBlocklist = pgTable(
  "software_blocklist",
  {
    id: id(),
    tenantId: tenantId(),
    pattern: text("pattern").notNull(),
  },
  (t) => [uniqueIndex("software_blocklist_uq").on(t.tenantId, t.pattern)],
);
