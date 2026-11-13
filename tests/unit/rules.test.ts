import { describe, expect, it } from "vitest";
import { diff } from "@/lib/audit";
import { maskTail } from "@/lib/crypto";
import { renderTemplate } from "@/lib/letters";
import { scopeFor, SYSTEM_ROLES } from "@/lib/permissions";
import { evaluateCondition, resolveSteps, validateDefinition } from "@/lib/workflow-rules";

describe("permissions", () => {
  it("returns the widest scope across roles", () => {
    const grants = [
      { key: "employee", permissions: ["employees.read"], scope: "self" as const },
      { key: "manager", permissions: ["employees.read", "approvals.act"], scope: "reports" as const },
    ];
    expect(scopeFor(grants, "employees.read")).toBe("reports");
    expect(scopeFor(grants, "approvals.act")).toBe("reports");
    expect(scopeFor(grants, "roles.manage")).toBeNull();
  });

  it("gives the owner every permission", () => {
    const owner = SYSTEM_ROLES.find((r) => r.key === "owner")!;
    expect(owner.permissions).toContain("audit.read");
    expect(owner.permissions).toContain("roles.manage");
  });
});

describe("workflow rules", () => {
  it("evaluates numeric and text conditions", () => {
    expect(evaluateCondition({ field: "amount", op: "gt", value: 1500 }, { amount: 2000 })).toBe(true);
    expect(evaluateCondition({ field: "amount", op: "gt", value: "1500" }, { amount: "900" })).toBe(false);
    expect(evaluateCondition({ field: "status", op: "eq", value: "Terminated" }, { status: "terminated" })).toBe(true);
    expect(evaluateCondition({ field: "status", op: "gt", value: "a" }, { status: "b" })).toBe(false);
    expect(evaluateCondition({ field: "missing", op: "eq", value: "x" }, {})).toBe(false);
  });

  it("keeps unconditional steps and matching conditional ones", () => {
    const def = {
      makerChecker: true,
      steps: [
        { name: "HR", approverRole: "hr_admin" },
        { name: "Finance director", approverRole: "finance_officer", condition: { field: "amount", op: "gt" as const, value: 1500 } },
      ],
    };
    expect(resolveSteps(def, { amount: 100 }).map((s) => s.name)).toEqual(["HR"]);
    expect(resolveSteps(def, { amount: 5000 }).map((s) => s.name)).toEqual(["HR", "Finance director"]);
  });

  it("validates definitions", () => {
    expect(validateDefinition({ makerChecker: true, steps: [] }, ["owner"])).toMatch(/at least one/);
    expect(validateDefinition({ makerChecker: true, steps: [{ name: "x", approverRole: "nope" }] }, ["owner"])).toMatch(/unknown role/);
    expect(validateDefinition({ makerChecker: true, steps: [{ name: "x", approverRole: "owner" }] }, ["owner"])).toBeNull();
  });
});

describe("letters", () => {
  it("fills placeholders and reports missing ones", () => {
    const r = renderTemplate("Dear {{ employee.fullName }}, welcome to {{tenant.name}} as {{employee.jobTitle}}.", {
      "employee.fullName": "Nimali Perera",
      "tenant.name": "Acme",
    });
    expect(r.text).toBe("Dear Nimali Perera, welcome to Acme as [employee.jobTitle].");
    expect(r.missing).toEqual(["employee.jobTitle"]);
  });

  it("never interprets values as template syntax", () => {
    const r = renderTemplate("Hi {{employee.fullName}}", { "employee.fullName": "{{tenant.name}} <b>x</b>" });
    expect(r.text).toBe("Hi {{tenant.name}} <b>x</b>");
  });
});

describe("helpers", () => {
  it("diffs only changed keys", () => {
    const d = diff({ a: 1, b: "x", c: null }, { a: 1, b: "y", c: undefined });
    expect(d).toEqual({ before: { b: "x" }, after: { b: "y" }, changed: true });
  });

  it("masks all but the last digits", () => {
    expect(maskTail("1234567890")).toBe("••••••7890");
    expect(maskTail("12")).toBe("••");
    expect(maskTail(null)).toBe("");
  });
});
