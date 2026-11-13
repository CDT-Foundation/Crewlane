import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonStyles = {
  primary: "bg-brand text-white hover:opacity-90",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-700 hover:bg-slate-100",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    buttonStyles[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const fieldBase =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-800",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100">
        {children}
      </table>
    </div>
  );
}

export const statusTone = {
  preboarding: "blue",
  probation: "amber",
  active: "green",
  resigned: "gray",
  terminated: "red",
  pending: "amber",
  approved: "green",
  rejected: "red",
  cancelled: "gray",
} as const;
