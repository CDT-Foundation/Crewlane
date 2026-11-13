/** Permission catalogue, scopes and the system roles seeded into every tenant. */

export const PERMISSIONS = {
  "org.manage": "Manage organisation structure and job grades",
  "employees.read": "View employee records",
  "employees.write": "Create and edit employee records",
  "employees.sensitive": "View ID, passport and bank details",
  "preboarding.manage": "Send pre-boarding invitations",
  "letters.manage": "Edit letter templates",
  "letters.issue": "Issue letters to employees",
  "workflows.manage": "Design approval workflows",
  "approvals.act": "Approve or reject requests",
  "roles.manage": "Manage roles and member access",
  "audit.read": "View the audit trail",
  "settings.manage": "Manage branding, domains and tenant settings",
  // Phase 2
  "assets.read": "View the asset register",
  "assets.manage": "Add assets, hand them over and take them back",
  "procurement.manage": "Manage vendors, purchase orders and goods receipts",
  "gatepass.manage": "Issue material and asset gate passes",
  "gatepass.scan": "Scan gate passes at the security gate",
  "helpdesk.agent": "Work IT service desk tickets",
  "helpdesk.manage": "Configure SLAs and see every ticket",
  "identity.manage": "Provision Google Workspace / Microsoft 365 accounts",
  "licences.manage": "Manage software subscriptions, seats and invoices",
  "telecom.manage": "Manage mobile lines and telecom bills",
  "offboarding.manage": "Run exit clearances and release final settlement",
  "integrations.manage": "Configure integrations and device agents",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

export const SCOPES = ["self", "reports", "department", "company"] as const;
export type Scope = (typeof SCOPES)[number];

const SCOPE_RANK: Record<Scope, number> = { self: 0, reports: 1, department: 2, company: 3 };

export function widerScope(a: Scope | null, b: Scope): Scope {
  if (!a) return b;
  return SCOPE_RANK[b] > SCOPE_RANK[a] ? b : a;
}

export type RoleGrant = { key: string; permissions: string[]; scope: Scope };

/**
 * Resolves the widest scope at which any of the member's roles grants
 * `permission`. Returns null when no role grants it.
 */
export function scopeFor(grants: RoleGrant[], permission: Permission): Scope | null {
  let scope: Scope | null = null;
  for (const g of grants) {
    if (g.permissions.includes(permission)) scope = widerScope(scope, g.scope);
  }
  return scope;
}

export type SystemRole = {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  defaultScope: Scope;
};

export const SYSTEM_ROLES: SystemRole[] = [
  {
    key: "owner",
    name: "Owner",
    description: "Full access to every module and setting.",
    permissions: ALL_PERMISSIONS,
    defaultScope: "company",
  },
  {
    key: "hr_admin",
    name: "HR administrator",
    description: "Runs the employee lifecycle, letters, pre-boarding and exit clearance.",
    permissions: [
      "org.manage", "employees.read", "employees.write", "employees.sensitive",
      "preboarding.manage", "letters.manage", "letters.issue", "approvals.act", "audit.read",
      "assets.read", "offboarding.manage",
    ],
    defaultScope: "company",
  },
  {
    key: "finance_officer",
    name: "Finance officer",
    description: "Second officer for high-risk changes; owns licence and telecom spend.",
    permissions: ["employees.read", "employees.sensitive", "approvals.act", "assets.read", "licences.manage", "telecom.manage"],
    defaultScope: "company",
  },
  {
    key: "it_manager",
    name: "IT manager",
    description: "Owns assets, procurement, the service desk and account provisioning.",
    permissions: [
      "employees.read", "approvals.act", "assets.read", "assets.manage", "procurement.manage", "gatepass.manage",
      "helpdesk.agent", "helpdesk.manage", "identity.manage", "licences.manage", "telecom.manage",
      "offboarding.manage", "integrations.manage",
    ],
    defaultScope: "company",
  },
  {
    key: "it_agent",
    name: "IT agent",
    description: "Works service desk tickets and hands over equipment.",
    permissions: ["employees.read", "assets.read", "assets.manage", "helpdesk.agent", "gatepass.manage"],
    defaultScope: "company",
  },
  {
    key: "procurement_officer",
    name: "Procurement officer",
    description: "Raises purchase orders and receives goods.",
    permissions: ["assets.read", "procurement.manage", "approvals.act"],
    defaultScope: "company",
  },
  {
    key: "security_guard",
    name: "Security guard",
    description: "Scans gate passes at the gate.",
    permissions: ["gatepass.scan"],
    defaultScope: "self",
  },
  {
    key: "manager",
    name: "Line manager",
    description: "Sees their team and approves their requests.",
    permissions: ["employees.read", "approvals.act"],
    defaultScope: "reports",
  },
  {
    key: "employee",
    name: "Employee",
    description: "Self-service access to their own record.",
    permissions: ["employees.read"],
    defaultScope: "self",
  },
];

/**
 * Permissions added to existing system roles when a tenant is upgraded to a
 * release. Applied once per release so tenant customisations are kept.
 */
export const RELEASE_PERMISSION_GRANTS: Record<string, Record<string, Permission[]>> = {
  phase2: {
    hr_admin: ["assets.read", "offboarding.manage"],
    finance_officer: ["assets.read", "licences.manage", "telecom.manage"],
  },
};
