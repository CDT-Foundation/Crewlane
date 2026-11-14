"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hasDarkClass = document.documentElement.classList.contains("dark");
    setIsDark(hasDarkClass);
  }, []);

  function toggle() {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("crewlane-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("crewlane-theme", "light");
    }
  }

  // Prevent hydration mismatch: render stable placeholder until mounted
  if (!mounted) {
    return (
      <div
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/60 bg-white/60 backdrop-blur-md opacity-60",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all duration-300",
        "border-slate-200/80 bg-white/70 text-slate-700 shadow-xs hover:border-slate-300 hover:bg-white/95 hover:shadow-md",
        "dark:border-white/10 dark:bg-slate-850/80 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-slate-800/90 dark:hover:shadow-black/50",
        "backdrop-blur-md active:scale-95",
        className,
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        {isDark ? (
          // Sun Icon (smooth glow)
          <svg
            className="size-4 text-amber-400 transition-transform duration-500 group-hover:rotate-45"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ) : (
          // Moon Icon (smooth star shimmer)
          <svg
            className="size-4 text-indigo-600 transition-transform duration-500 group-hover:-rotate-12 dark:text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}
      </span>
      {showLabel ? <span>{isDark ? "Light" : "Dark"}</span> : null}
    </button>
  );
}
