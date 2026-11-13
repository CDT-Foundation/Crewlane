/** Pure depreciation maths. Amounts are numbers rounded to 2 decimals. */

export type DepreciationInput = {
  cost: number;
  salvage: number;
  purchaseDate: string; // YYYY-MM-DD
  method: "straight_line" | "written_down_value";
  usefulLifeMonths: number;
  wdvRatePct: number; // annual
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole months from purchase to `asOf` (a month counts once it has started). */
export function monthsInService(purchaseDate: string, asOf: string): number {
  const [py, pm] = purchaseDate.split("-").map(Number);
  const [ay, am] = asOf.split("-").map(Number);
  return Math.max(0, (ay - py) * 12 + (am - pm));
}

export function bookValueAfter(input: DepreciationInput, months: number): number {
  const { cost, salvage } = input;
  if (cost <= 0) return 0;
  if (input.method === "straight_line") {
    const life = Math.max(1, input.usefulLifeMonths);
    const monthly = (cost - salvage) / life;
    return round2(Math.max(salvage, cost - monthly * Math.min(months, life)));
  }
  const monthlyFactor = Math.pow(1 - input.wdvRatePct / 100, 1 / 12);
  return round2(Math.max(salvage, cost * Math.pow(monthlyFactor, months)));
}

export function bookValueAt(input: DepreciationInput, asOf: string): number {
  return bookValueAfter(input, monthsInService(input.purchaseDate, asOf));
}

export type ScheduleRow = { year: number; opening: number; depreciation: number; closing: number };

/** Year-by-year schedule from the purchase year until fully depreciated (max 15 years). */
export function annualSchedule(input: DepreciationInput): ScheduleRow[] {
  const startYear = Number(input.purchaseDate.slice(0, 4));
  const startMonth = Number(input.purchaseDate.slice(5, 7));
  const rows: ScheduleRow[] = [];
  let monthsElapsed = 0;
  let opening = round2(input.cost);
  for (let year = startYear; year < startYear + 15; year++) {
    const monthsThisYear = year === startYear ? 12 - startMonth + 1 : 12;
    monthsElapsed += monthsThisYear;
    const closing = bookValueAfter(input, monthsElapsed);
    rows.push({ year, opening, depreciation: round2(opening - closing), closing });
    opening = closing;
    if (closing <= input.salvage + 0.005) break;
  }
  return rows;
}

/** Depreciation charged within a calendar period [from, to] (inclusive months). */
export function depreciationForPeriod(input: DepreciationInput, from: string, to: string): number {
  const start = Math.max(0, monthsInService(input.purchaseDate, from));
  const end = Math.max(0, monthsInService(input.purchaseDate, to) + 1);
  return round2(bookValueAfter(input, start) - bookValueAfter(input, end));
}
