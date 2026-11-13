import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/* ------------------------------------------------------------------ */
/* Global registry (no RLS): which tenants exist and which hosts map   */
/* to them. Everything below this block is tenant-scoped and protected */
/* by Postgres row-level security (see drizzle/0001_security.sql).     */
/* ------------------------------------------------------------------ */

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);

export type TenantBranding = {
  primaryColor?: string;
  logoUrl?: string;
  letterheadName?: string;
  letterheadAddress?: string;
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: tenantStatus("status").notNull().default("active"),
  country: text("country").notNull().default("LK"),
  currency: text("currency").notNull().default("LKR"),
  timezone: text("timezone").notNull().default("Asia/Colombo"),
  branding: jsonb("branding").$type<TenantBranding>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantDomains = pgTable("tenant_domains", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  verificationToken: text("verification_token").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------ Org ------------------------------- */

export const orgUnitType = pgEnum("org_unit_type", [
  "legal_entity",
  "business_unit",
  "branch",
  "factory",
  "department",
  "cost_centre",
  "location",
]);

export const orgUnits = pgTable(
  "org_units",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    type: orgUnitType("type").notNull(),
    name: text("name").notNull(),
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete("restrict"),
    index("org_units_tenant_parent_idx").on(t.tenantId, t.parentId),
    uniqueIndex("org_units_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

export const jobGrades = pgTable(
  "job_grades",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: integer("level").notNull().default(1),
  },
  (t) => [uniqueIndex("job_grades_tenant_code_uq").on(t.tenantId, t.code)],
);

/* --------------------------- Employees ---------------------------- */

export const employeeStatus = pgEnum("employee_status", [
  "preboarding",
  "probation",
  "active",
  "resigned",
  "terminated",
]);

export const employmentType = pgEnum("employment_type", [
  "permanent",
  "contract",
  "intern",
  "casual",
]);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeNo: text("employee_no").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    workEmail: text("work_email"),
    personalEmail: text("personal_email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    orgUnitId: uuid("org_unit_id").references(() => orgUnits.id, { onDelete: "set null" }),
    jobGradeId: uuid("job_grade_id").references(() => jobGrades.id, { onDelete: "set null" }),
    managerId: uuid("manager_id"),
    dottedManagerId: uuid("dotted_manager_id"),
    employmentType: employmentType("employment_type").notNull().default("permanent"),
    status: employeeStatus("status").notNull().default("preboarding"),
    hireDate: date("hire_date"),
    exitDate: date("exit_date"),
    // Sensitive fields: only shown to roles with `employees.sensitive`.
    nationalId: text("national_id"),
    passportNo: text("passport_no"),
    passportExpiry: date("passport_expiry"),
    visaExpiry: date("visa_expiry"),
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    address: text("address"),
    emergencyContact: text("emergency_contact"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.managerId], foreignColumns: [t.id] }).onDelete("set null"),
    foreignKey({ columns: [t.dottedManagerId], foreignColumns: [t.id] }).onDelete("set null"),
    uniqueIndex("employees_tenant_no_uq").on(t.tenantId, t.employeeNo),
    index("employees_tenant_unit_idx").on(t.tenantId, t.orgUnitId),
    index("employees_tenant_manager_idx").on(t.tenantId, t.managerId),
  ],
);

/* ---------------------- Membership and access --------------------- */

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (t) => [uniqueIndex("roles_tenant_key_uq").on(t.tenantId, t.key)],
);

export const accessScope = pgEnum("access_scope", [
  "self",
  "reports",
  "department",
  "company",
]);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    scope: accessScope("scope").notNull().default("company"),
  },
  (t) => [uniqueIndex("membership_roles_uq").on(t.membershipId, t.roleId)],
);

/* ---------------------- Workflows and approvals -------------------- */

export type WorkflowCondition = {
  field: string;
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: string | number;
};

export type WorkflowStep = {
  name: string;
  /** A role key, or "@manager" for the subject employee's line manager. */
  approverRole: string;
  condition?: WorkflowCondition;
  /** Resolved when a request is raised for "@manager" steps. */
  approverEmployeeId?: string | null;
};

export type WorkflowDefinition = {
  steps: WorkflowStep[];
  /** Maker-checker: the requester can never approve any step. */
  makerChecker: boolean;
};

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    name: text("name").notNull(),
    definition: jsonb("definition").$type<WorkflowDefinition>().notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workflows_tenant_trigger_uq").on(t.tenantId, t.trigger)],
);

export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    trigger: text("trigger").notNull(),
    title: text("title").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    // Snapshot of the steps that apply to this request (conditions resolved).
    steps: jsonb("steps").$type<WorkflowStep[]>().notNull(),
    makerChecker: boolean("maker_checker").notNull().default(true),
    currentStep: integer("current_step").notNull().default(0),
    status: approvalStatus("status").notNull().default("pending"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("approval_requests_tenant_status_idx").on(t.tenantId, t.status)],
);

export const approvalActions = pgTable("approval_actions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => approvalRequests.id, { onDelete: "cascade" }),
  step: integer("step").notNull(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  decision: text("decision", { enum: ["approve", "reject"] }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- Letters ----------------------------- */

export const letterTemplates = pgTable(
  "letter_templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("letter_templates_tenant_key_uq").on(t.tenantId, t.key)],
);

export const letters = pgTable("letters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => letterTemplates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** SHA-256 of tenant id + body + issuer + time; printed on the letter. */
  signatureHash: text("signature_hash").notNull(),
  issuedBy: text("issued_by")
    .notNull()
    .references(() => user.id),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Pre-boarding -------------------------- */

export const preboardingInvites = pgTable("preboarding_invites", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------ Audit and events ------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    ip: text("ip"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Filled by a database trigger: a per-tenant sequence and SHA-256 hash chain.
    seq: bigint("seq", { mode: "number" }),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (t) => [uniqueIndex("audit_log_tenant_seq_uq").on(t.tenantId, t.seq)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("outbox_pending_idx").on(t.id).where(sql`processed_at is null`)],
);
