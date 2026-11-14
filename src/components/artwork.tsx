import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { BoltIcon, CpuIcon, ShieldCheckIcon } from "@/components/icons";

export function AmbientBackground({ className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)} aria-hidden="true">
      {/* Top Left Indigo Glow */}
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/10 blur-3xl dark:from-indigo-600/20 dark:to-purple-600/10 animate-pulse-subtle" />
      {/* Top Right Cyan Glow */}
      <div className="absolute top-1/4 -right-32 h-[32rem] w-[32rem] rounded-full bg-gradient-to-bl from-cyan-400/20 via-sky-500/15 to-transparent blur-3xl dark:from-cyan-500/20 dark:via-blue-600/15" />
      {/* Bottom Center Violet Glow */}
      <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-gradient-to-t from-violet-500/15 to-indigo-500/0 blur-3xl dark:from-violet-600/20" />
      {/* Subtle Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 dark:opacity-20" />
    </div>
  );
}

export function AuthArtwork() {
  return (
    <div className="relative hidden w-full flex-col justify-between overflow-hidden rounded-3xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-indigo-900/90 via-slate-900/90 to-brand/90 p-10 text-white shadow-2xl backdrop-blur-2xl lg:flex">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />

      {/* Header brand tag */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md border border-white/20 shadow-inner">
          <svg className="size-5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <span className="font-bold tracking-tight text-white">Crewlane</span>
          <span className="ml-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-300 uppercase">
            Workforce OS
          </span>
        </div>
      </div>

      {/* Center SVG Illustration Artwork */}
      <div className="relative z-10 my-10 flex flex-col items-center">
        <div className="relative flex size-64 items-center justify-center">
          {/* Animated concentric rings */}
          <div className="absolute inset-0 rounded-full border border-white/10 animate-spin" style={{ animationDuration: "25s" }} />
          <div className="absolute inset-4 rounded-full border border-cyan-500/20 border-dashed animate-spin" style={{ animationDuration: "35s", animationDirection: "reverse" }} />
          <div className="absolute inset-10 rounded-full border border-indigo-400/20" />

          {/* Central isometric node */}
          <div className="relative flex size-24 items-center justify-center rounded-2xl border border-white/30 bg-white/10 shadow-2xl backdrop-blur-xl animate-float">
            <svg className="size-12 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>

          {/* Floating feature pills around center */}
          <div className="absolute -top-2 -left-4 flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md animate-float">
            <BoltIcon size={14} className="text-amber-300" />
            <span>Zero-touch Onboarding</span>
          </div>
          <div className="absolute top-1/2 -right-8 flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur-md animate-float-reverse">
            <CpuIcon size={14} className="text-cyan-300" />
            <span>Ownmind In-House AI</span>
          </div>
          <div className="absolute -bottom-2 -left-2 flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-200 shadow-lg backdrop-blur-md animate-float">
            <ShieldCheckIcon size={14} className="text-emerald-300" />
            <span>SHA-256 Audit Chain</span>
          </div>
        </div>

        <h2 className="mt-8 text-center text-xl font-bold tracking-tight text-white">
          Where HR, Payroll and IT Unify
        </h2>
        <p className="mt-2 text-center text-xs text-slate-300 max-w-xs leading-relaxed">
          From first offer letter to final asset clearance — all governed by multi-tenant PostgreSQL Row-Level Security.
        </p>
      </div>

      {/* Footer highlights */}
      <div className="relative z-10 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
        <div>
          <p className="text-sm font-bold text-cyan-300">100%</p>
          <p className="text-[10px] text-slate-400">Data Privacy</p>
        </div>
        <div>
          <p className="text-sm font-bold text-white">50+</p>
          <p className="text-[10px] text-slate-400">RLS Tables</p>
        </div>
        <div>
          <p className="text-sm font-bold text-indigo-300">0 API</p>
          <p className="text-[10px] text-slate-400">AI Token Costs</p>
        </div>
      </div>
    </div>
  );
}
