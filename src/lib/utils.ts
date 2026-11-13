import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatDateTime(d: Date | string | null | undefined, timeZone = "Asia/Colombo") {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  }).format(date);
}

export function humanize(key: string) {
  const s = key.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** ISO date (YYYY-MM-DD) `days` from now; keeps clock reads out of render code. */
export function isoDateFromNow(days = 0) {
  return new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
}

export function isPast(d: Date) {
  return d.getTime() < Date.now();
}

export function money(amount: string | number | null | undefined, currency: string) {
  return `${currency} ${Number(amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
