"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: ReactNode; badge?: number; soon?: string };
export type NavGroup = { label: string; items: NavItem[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  // Highlight only the most specific matching item (e.g. /app/assets/requests over /app/assets).
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const best = all
    .filter((h) => (h === "/app" ? path === "/app" : path === h || path.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {g.label}
          </p>
          <ul className="space-y-1">
            {g.items.map((item) => {
              const active = item.href === best;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200",
                      active
                        ? "bg-brand/10 dark:bg-brand/20 text-brand dark:text-cyan-300 font-semibold border border-brand/20 dark:border-brand/35 shadow-xs backdrop-blur-md"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white",
                      item.soon && "text-slate-400 dark:text-slate-500 hover:text-slate-500",
                    )}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      {item.icon ? (
                        <span className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand dark:bg-cyan-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                        {item.badge}
                      </span>
                    ) : item.soon ? (
                      <span className="rounded-md border border-slate-200/60 dark:border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {item.soon}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
