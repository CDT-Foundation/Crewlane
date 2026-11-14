import { AmbientBackground } from "@/components/artwork";
import { BoltIcon } from "@/components/icons";

export default function Loading() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
      <AmbientBackground />

      <div className="glass-panel relative flex flex-col items-center rounded-3xl p-10 shadow-2xl backdrop-blur-2xl max-w-sm w-full text-center border border-white/60 dark:border-white/10 animate-fade-in">
        {/* Orbital concentric rings animation */}
        <div className="relative flex size-20 items-center justify-center">
          {/* Outer glowing clockwise ring */}
          <div
            className="absolute inset-0 rounded-full border-2 border-brand/20 dark:border-cyan-400/20 border-t-brand dark:border-t-cyan-400 animate-spin"
            style={{ animationDuration: "1.2s" }}
          />
          {/* Middle counter-clockwise ring */}
          <div
            className="absolute inset-2 rounded-full border-2 border-indigo-400/20 dark:border-indigo-400/20 border-b-indigo-500 dark:border-b-indigo-400 animate-spin-reverse"
            style={{ animationDuration: "1.8s" }}
          />
          {/* Center glowing logo */}
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-brand/30 dark:shadow-cyan-500/20 animate-pulse-subtle">
            <BoltIcon size={20} />
          </div>
        </div>

        <h3 className="mt-6 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
          Loading Crewlane
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Syncing tenant workspace & permissions…
        </p>

        {/* Indeterminate linear progress bar with glass shine */}
        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-brand via-indigo-500 to-cyan-400 dark:from-cyan-500 dark:via-blue-500 dark:to-indigo-400 animate-progress-indeterminate" />
        </div>
      </div>
    </div>
  );
}
