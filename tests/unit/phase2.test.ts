import { describe, expect, it } from "vitest";
import { annualSchedule, bookValueAt, depreciationForPeriod, monthsInService } from "@/lib/depreciation";
import { blocklistHits } from "@/lib/discovery";
import { annualCost, dueReminderWindows } from "@/lib/licences";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { dueDates, minutesLabel, slaState } from "@/lib/sla";
import { parseBillCsv } from "@/lib/telecom";
import { suggestEmail } from "@/lib/onboarding";

const laptop = { cost: 360000, salvage: 0, purchaseDate: "2026-01-15", method: "straight_line" as const, usefulLifeMonths: 36, wdvRatePct: 33.33 };

describe("depreciation", () => {
  it("counts whole months in service", () => {
    expect(monthsInService("2026-01-15", "2026-01-31")).toBe(0);
    expect(monthsInService("2026-01-15", "2027-01-01")).toBe(12);
  });

  it("straight line reaches salvage at end of life", () => {
    expect(bookValueAt(laptop, "2026-01-20")).toBe(360000);
    expect(bookValueAt(laptop, "2027-01-20")).toBe(240000);
    expect(bookValueAt(laptop, "2030-01-01")).toBe(0);
  });

  it("written-down value declines geometrically and never below salvage", () => {
    const car = { cost: 10_000_000, salvage: 500_000, purchaseDate: "2026-01-01", method: "written_down_value" as const, usefulLifeMonths: 96, wdvRatePct: 20 };
    expect(bookValueAt(car, "2027-01-01")).toBeCloseTo(8_000_000, -1);
    expect(bookValueAt(car, "2060-01-01")).toBe(500_000);
  });

  it("annual schedule sums to the depreciable amount", () => {
    const rows = annualSchedule(laptop);
    expect(rows[0]).toMatchObject({ year: 2026, opening: 360000 });
    expect(rows.reduce((s, r) => s + r.depreciation, 0)).toBeCloseTo(360000, 1);
    expect(rows.at(-1)!.closing).toBe(0);
  });

  it("charges a period by month", () => {
    expect(depreciationForPeriod(laptop, "2026-01-01", "2026-12-01")).toBe(120000);
  });
});

describe("SLA", () => {
  const created = new Date("2026-11-13T08:00:00Z");
  const due = dueDates(created, { responseMinutes: 60, resolveMinutes: 480 });
  it("computes due dates", () => {
    expect(due.resolveDueAt.toISOString()).toBe("2026-11-13T16:00:00.000Z");
  });
  it("classifies on track, at risk, breached and met", () => {
    const t = { createdAt: created, resolveDueAt: due.resolveDueAt, resolvedAt: null };
    expect(slaState(t, new Date("2026-11-13T09:00:00Z"))).toBe("on_track");
    expect(slaState(t, new Date("2026-11-13T15:00:00Z"))).toBe("at_risk");
    expect(slaState(t, new Date("2026-11-13T17:00:00Z"))).toBe("breached");
    expect(slaState({ ...t, resolvedAt: new Date("2026-11-13T12:00:00Z") }, new Date())).toBe("met");
  });
  it("labels time left", () => {
    expect(minutesLabel(90 * 60_000)).toBe("1h 30m left");
    expect(minutesLabel(-26 * 3600_000)).toBe("1d 2h over");
  });
});

describe("licences", () => {
  it("annualises monthly plans", () => {
    expect(annualCost({ seatsTotal: 10, costPerSeat: "1000", billingCycle: "monthly" })).toBe(120000);
    expect(annualCost({ seatsTotal: 10, costPerSeat: "1000", billingCycle: "annual" })).toBe(10000);
  });
  it("sends each reminder window once, the closest first", () => {
    expect(dueReminderWindows("2026-12-31", "2026-11-13", [])).toEqual([]);
    expect(dueReminderWindows("2026-12-10", "2026-11-13", [])).toEqual([30]);
    expect(dueReminderWindows("2026-11-20", "2026-11-13", [30])).toEqual([7]);
    expect(dueReminderWindows("2026-11-20", "2026-11-13", [30, 14, 7])).toEqual([]);
  });
});

describe("telecom and discovery helpers", () => {
  it("parses bill CSVs with or without a header", () => {
    expect(parseBillCsv('number,amount\n"077 123 4567","4,250.50"\n\nbad,row\n0712223334;1800')).toEqual([
      { number: "0771234567", amount: 4250.5 },
      { number: "0712223334", amount: 1800 },
    ]);
  });
  it("matches blocklisted software case-insensitively", () => {
    expect(blocklistHits(["Google Chrome", "uTorrent 3.6"], ["utorrent", "teamviewer"])).toEqual(["utorrent"]);
  });
  it("suggests a clean work email", () => {
    expect(suggestEmail("Nimal", "Perera-Silva", "Acme.LK")).toBe("nimal.pererasilva@acme.lk");
  });
});

describe("secrets", () => {
  it("round-trips and detects tampering", () => {
    const blob = encryptSecret("client-secret-123");
    expect(decryptSecret(blob)).toBe("client-secret-123");
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
