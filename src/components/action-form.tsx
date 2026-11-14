"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons";
import type { ActionState } from "@/lib/actions";
import { toast } from "./toaster";
import { type ButtonVariant, buttonClass } from "./ui";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  inline?: boolean;
};

export function SubmitButton({ label, variant = "primary" }: { label: string; variant?: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, "inline-flex items-center gap-2")}>
      {pending ? (
        <>
          <SpinnerIcon size={14} className="animate-spin shrink-0" />
          <span>Processing…</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** A form bound to a server action that shows its success or error message. */
export function ActionForm({
  action, children, submitLabel = "Save", variant, className, resetOnSuccess, confirm, inline,
}: Props) {
  // Toast from the action's own promise, so the message still shows if the
  // refreshed page no longer contains this form.
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok) toast(r.ok);
    return r;
  }, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className ?? (inline ? "inline-flex items-center gap-2" : "space-y-4")}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className={inline ? "contents" : "flex items-center gap-3"}>
        <SubmitButton label={submitLabel} variant={variant} />
        {state?.error ? (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        ) : state?.ok ? (
          <p role="status" className="text-sm text-emerald-700">{state.ok}</p>
        ) : null}
      </div>
    </form>
  );
}
