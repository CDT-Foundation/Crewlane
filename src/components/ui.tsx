import Link from "next/link";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonStyles = {
  primary:
    "bg-brand text-white shadow-md shadow-brand/20 hover:brightness-110 hover:shadow-lg hover:shadow-brand/25 dark:shadow-brand/40 border border-white/10 active:scale-[0.98]",
  secondary:
    "border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 hover:bg-white/95 dark:hover:bg-slate-750 hover:border-slate-300 dark:hover:border-white/20 backdrop-blur-md shadow-xs active:scale-[0.98]",
  danger:
    "bg-rose-600 dark:bg-rose-600/90 text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 hover:shadow-rose-600/30 active:scale-[0.98]",
  ghost:
    "text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/5 active:scale-[0.98]",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
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
  "w-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 shadow-xs outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand dark:focus:border-brand focus:ring-2 focus:ring-brand/20 dark:focus:ring-brand/30 disabled:bg-slate-50/50 dark:disabled:bg-slate-800/40";

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
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/70 dark:border-white/10 bg-white/70 dark:bg-slate-900/65 backdrop-blur-xl shadow-xl shadow-slate-200/40 dark:shadow-black/40 transition-all duration-300",
        className,
      )}
    >
      {title || actions ? (
        <header className="flex items-center justify-between gap-4 border-b border-slate-100/80 dark:border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}

const badgeTones = {
  gray: "bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/10",
  green: "bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25",
  amber: "bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25",
  red: "bg-rose-500/10 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25",
  blue: "bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-xs", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300/80 dark:border-white/15 bg-white/40 dark:bg-slate-900/30 backdrop-blur-sm p-8 text-center text-sm text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-500 dark:[&_th]:text-slate-400 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100/80 dark:[&_tbody_tr]:border-white/5 hover:[&_tbody_tr]:bg-slate-50/50 dark:hover:[&_tbody_tr]:bg-white/[0.02] transition-colors">
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

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-xl bg-slate-200/60 dark:bg-slate-800/50 backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

export function GlassLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8", className)}>
      <div className="relative flex size-14 items-center justify-center">
        {/* Outer glowing orbital ring */}
        <div className="absolute inset-0 rounded-full border-2 border-brand/20 dark:border-cyan-400/20 border-t-brand dark:border-t-cyan-400 animate-spin" />
        {/* Inner reverse counter ring */}
        <div className="absolute inset-2 rounded-full border-2 border-indigo-400/20 dark:border-indigo-400/20 border-b-indigo-500 dark:border-b-indigo-400 animate-spin-reverse" />
        {/* Pulsing core orb */}
        <div className="size-3 rounded-full bg-brand dark:bg-cyan-400 shadow-lg shadow-brand/40 dark:shadow-cyan-400/40 animate-pulse" />
      </div>
      {label ? (
        <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
      ) : null}
    </div>
  );
}
