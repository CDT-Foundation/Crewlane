"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; badge?: number; soon?: string };
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
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = item.href === best;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
                      active ? "bg-brand/10 font-medium text-brand" : "text-slate-700 hover:bg-slate-100",
                      item.soon && "text-slate-400",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{item.badge}</span>
                    ) : item.soon ? (
                      <span className="text-[10px] uppercase tracking-wide">{item.soon}</span>
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
