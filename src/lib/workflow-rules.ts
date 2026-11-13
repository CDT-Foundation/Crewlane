/** Pure workflow logic (no I/O) so it can be unit tested. */
import type { WorkflowCondition, WorkflowDefinition, WorkflowStep } from "@/db/schema";

/** Special approver: the line manager of the employee the request is about. */
export const MANAGER_STEP = "@manager";

export type TriggerField = { key: string; label: string; type: "number" | "text" };

export type TriggerSpec = {
  label: string;
  description: string;
  fields: TriggerField[];
  /** Used when the tenant has no active workflow for this trigger. */
  fallback: WorkflowDefinition;
};

/** Actions that go through the approval engine in Phase 1. */
export const TRIGGERS: Record<string, TriggerSpec> = {
  "employee.bank_change": {
    label: "Change of salary bank account",
    description: "High-risk: a payroll redirect. Always maker-checker.",
    fields: [],
    fallback: {
      makerChecker: true,
      steps: [{ name: "Second officer review", approverRole: "finance_officer" }],
    },
  },
  "employee.status_change": {
    label: "Resignation or termination",
    description: "Ends employment and opens the offboarding clearance gate.",
    fields: [{ key: "status", label: "New status", type: "text" }],
    fallback: {
      makerChecker: true,
      steps: [{ name: "HR approval", approverRole: "hr_admin" }],
    },
  },
  "asset.request": {
    label: "Equipment request",
    description: "Laptops, phones and other assets. Approved requests are filled from stock or sent to procurement.",
    fields: [{ key: "amount", label: "Estimated total", type: "number" }],
    fallback: {
      makerChecker: true,
      steps: [
        { name: "Line manager", approverRole: MANAGER_STEP },
        { name: "IT manager", approverRole: "it_manager", condition: { field: "amount", op: "gt", value: 1500 } },
      ],
    },
  },
  "purchase_order.issue": {
    label: "Purchase order",
    description: "Releases a purchase order to the vendor.",
    fields: [{ key: "amount", label: "PO total", type: "number" }],
    fallback: {
      makerChecker: true,
      steps: [
        { name: "Finance approval", approverRole: "finance_officer" },
        { name: "Owner approval", approverRole: "owner", condition: { field: "amount", op: "gt", value: 500000 } },
      ],
    },
  },
};

export function isTrigger(key: string): key is keyof typeof TRIGGERS {
  return key in TRIGGERS;
}

export function evaluateCondition(cond: WorkflowCondition, payload: Record<string, unknown>): boolean {
  const raw = payload[cond.field];
  if (raw === undefined || raw === null) return false;
  const leftNum = typeof raw === "number" ? raw : Number(raw);
  const rightNum = typeof cond.value === "number" ? cond.value : Number(cond.value);
  const numeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && String(raw).trim() !== "";
  if (numeric) {
    switch (cond.op) {
      case "gt": return leftNum > rightNum;
      case "gte": return leftNum >= rightNum;
      case "lt": return leftNum < rightNum;
      case "lte": return leftNum <= rightNum;
      case "eq": return leftNum === rightNum;
      case "neq": return leftNum !== rightNum;
    }
  }
  const l = String(raw).toLowerCase();
  const r = String(cond.value).toLowerCase();
  switch (cond.op) {
    case "eq": return l === r;
    case "neq": return l !== r;
    default: return false; // ordering comparisons need numbers
  }
}

/** Steps that apply to this payload: unconditional ones plus matched conditions. */
export function resolveSteps(def: WorkflowDefinition, payload: Record<string, unknown>): WorkflowStep[] {
  return def.steps.filter((s) => !s.condition || evaluateCondition(s.condition, payload));
}

export function validateDefinition(def: WorkflowDefinition, roleKeys: string[]): string | null {
  if (def.steps.length === 0) return "Add at least one approval step.";
  if (def.steps.length > 6) return "A workflow can have at most 6 steps.";
  for (const [i, s] of def.steps.entries()) {
    if (!s.name.trim()) return `Step ${i + 1} needs a name.`;
    if (s.approverRole !== MANAGER_STEP && !roleKeys.includes(s.approverRole)) {
      return `Step ${i + 1}: unknown role "${s.approverRole}".`;
    }
    if (s.condition && (!s.condition.field || s.condition.value === "")) {
      return `Step ${i + 1}: complete or remove the condition.`;
    }
  }
  return null;
}
