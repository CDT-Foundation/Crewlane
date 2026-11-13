import { Counter, collectDefaultMetrics, Registry } from "prom-client";

const globalForMetrics = globalThis as unknown as { __crewlaneMetrics?: ReturnType<typeof create> };

function create() {
  const registry = new Registry();
  registry.setDefaultLabels({ service: "crewlane-web" });
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    signIns: new Counter({
      name: "crewlane_sign_ins_total",
      help: "Sign-in attempts by result",
      labelNames: ["result"] as const,
      registers: [registry],
    }),
    approvals: new Counter({
      name: "crewlane_approval_decisions_total",
      help: "Approval decisions by trigger and decision",
      labelNames: ["trigger", "decision"] as const,
      registers: [registry],
    }),
    tenantsCreated: new Counter({
      name: "crewlane_tenants_created_total",
      help: "Tenants provisioned",
      registers: [registry],
    }),
  };
}

export const metrics = (globalForMetrics.__crewlaneMetrics ??= create());
