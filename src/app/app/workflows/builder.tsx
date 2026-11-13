"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { buttonClass, Input, Select } from "@/components/ui";
import type { WorkflowCondition, WorkflowDefinition, WorkflowStep } from "@/db/schema";
import type { ActionState } from "@/lib/actions";
import type { TriggerField } from "@/lib/workflow-rules";

const OPS = [
  ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["eq", "="], ["neq", "≠"],
] as const;

export function WorkflowBuilder({
  action, initial, active, roles, fields,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  initial: WorkflowDefinition;
  active: boolean;
  roles: { key: string; name: string }[];
  fields: TriggerField[];
}) {
  const [state, formAction] = useActionState(action, null);
  const [steps, setSteps] = useState<WorkflowStep[]>(initial.steps);
  const [makerChecker, setMakerChecker] = useState(initial.makerChecker);

  const update = (i: number, patch: Partial<WorkflowStep>) =>
    setSteps((s) => s.map((step, j) => (j === i ? { ...step, ...patch } : step)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const next = [...s];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x);
      return next;
    });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="definition" value={JSON.stringify({ makerChecker, steps })} />
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
              <Input value={step.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Step name" className="w-56" aria-label="Step name" />
              <span className="text-sm text-slate-500">approved by</span>
              <Select value={step.approverRole} onChange={(e) => update(i, { approverRole: e.target.value })} className="w-48" aria-label="Approver role">
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </Select>
              <div className="ml-auto flex gap-1">
                <button type="button" className={buttonClass("ghost", "px-2")} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className={buttonClass("ghost", "px-2")} disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className={buttonClass("ghost", "px-2 text-red-600")} onClick={() => setSteps((s) => s.filter((_, j) => j !== i))} aria-label="Remove step">✕</button>
              </div>
            </div>
            {fields.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-sm">
                {step.condition ? (
                  <>
                    <span className="text-slate-500">only if</span>
                    <Select value={step.condition.field} onChange={(e) => update(i, { condition: { ...step.condition!, field: e.target.value } })} className="w-40" aria-label="Field">
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                    <Select value={step.condition.op} onChange={(e) => update(i, { condition: { ...step.condition!, op: e.target.value as WorkflowCondition["op"] } })} className="w-20" aria-label="Operator">
                      {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <Input value={String(step.condition.value)} onChange={(e) => update(i, { condition: { ...step.condition!, value: e.target.value } })} className="w-36" aria-label="Value" />
                    <button type="button" className="text-xs text-slate-500 underline" onClick={() => update(i, { condition: undefined })}>remove condition</button>
                  </>
                ) : (
                  <button type="button" className="text-xs text-brand underline" onClick={() => update(i, { condition: { field: fields[0].key, op: "eq", value: "" } })}>
                    + add condition
                  </button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={buttonClass("secondary")}
        onClick={() => setSteps((s) => [...s, { name: `Step ${s.length + 1}`, approverRole: roles[0]?.key ?? "owner" }])}
        disabled={steps.length >= 6}
      >
        + Add step
      </button>

      <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={makerChecker} onChange={(e) => setMakerChecker(e.target.checked)} />
          Maker-checker: the requester can never approve, and each step needs a different officer
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={active} />
          Active (when inactive, the built-in safe default is used)
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="Save workflow" />
        {state?.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
        {state?.ok ? <p role="status" className="text-sm text-emerald-700">{state.ok}</p> : null}
      </div>
    </form>
  );
}
