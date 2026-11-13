/** Pure SLA calculations (calendar time; business-hours calendars come with Phase 3 shifts). */

export type SlaPolicy = { responseMinutes: number; resolveMinutes: number };

export function dueDates(createdAt: Date, policy: SlaPolicy) {
  return {
    responseDueAt: new Date(createdAt.getTime() + policy.responseMinutes * 60_000),
    resolveDueAt: new Date(createdAt.getTime() + policy.resolveMinutes * 60_000),
  };
}

export type SlaState = "met" | "on_track" | "at_risk" | "breached" | "none";

/** State of the resolve SLA. At risk = less than 25% of the window left. */
export function slaState(
  t: { createdAt: Date; resolveDueAt: Date | null; resolvedAt: Date | null },
  now: Date,
): SlaState {
  if (!t.resolveDueAt) return "none";
  if (t.resolvedAt) return t.resolvedAt <= t.resolveDueAt ? "met" : "breached";
  if (now > t.resolveDueAt) return "breached";
  const total = t.resolveDueAt.getTime() - t.createdAt.getTime();
  const left = t.resolveDueAt.getTime() - now.getTime();
  return total > 0 && left / total < 0.25 ? "at_risk" : "on_track";
}

export function minutesLabel(ms: number): string {
  const neg = ms < 0;
  const m = Math.round(Math.abs(ms) / 60_000);
  const label = m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return neg ? `${label} over` : `${label} left`;
}
