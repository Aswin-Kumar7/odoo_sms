import { describe, expect, it } from "vitest";
import { addMonthsAnchored, monthlyFactor, nextPeriodStart, periodIndex, periodStart, termEnd } from "../../src/lib/periods.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("monthly periods anchored to the start date", () => {
  it("clamps to month end without drifting", () => {
    const anchor = d("2026-01-31");
    expect([1, 2, 3, 4].map((k) => iso(periodStart(anchor, "MONTHLY", 1, k)))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("uses Feb 29 in leap years", () => {
    expect(iso(addMonthsAnchored(d("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("next period after a clamped date returns to the anchor day", () => {
    expect(iso(nextPeriodStart(d("2026-01-31"), "MONTHLY", 1, d("2026-02-28")))).toBe("2026-03-31");
  });

  it("supports intervals (quarterly)", () => {
    expect(iso(nextPeriodStart(d("2026-01-15"), "MONTHLY", 3, d("2026-01-15")))).toBe("2026-04-15");
  });

  it("crosses year boundaries", () => {
    expect(iso(periodStart(d("2026-11-30"), "MONTHLY", 1, 3))).toBe("2027-02-28");
  });
});

describe("other periods", () => {
  it("daily and weekly add fixed days", () => {
    expect(iso(nextPeriodStart(d("2026-12-31"), "DAILY", 1, d("2026-12-31")))).toBe("2027-01-01");
    expect(iso(nextPeriodStart(d("2026-10-01"), "WEEKLY", 2, d("2026-10-01")))).toBe("2026-10-15");
  });

  it("yearly from Feb 29 lands on Feb 28", () => {
    expect(iso(periodStart(d("2028-02-29"), "YEARLY", 1, 1))).toBe("2029-02-28");
    expect(iso(periodStart(d("2028-02-29"), "YEARLY", 1, 4))).toBe("2032-02-29");
  });
});

describe("periodIndex", () => {
  it("finds the period containing a date", () => {
    const a = d("2026-01-31");
    expect(periodIndex(a, "MONTHLY", 1, d("2026-01-31"))).toBe(0);
    expect(periodIndex(a, "MONTHLY", 1, d("2026-02-27"))).toBe(0);
    expect(periodIndex(a, "MONTHLY", 1, d("2026-02-28"))).toBe(1);
    expect(periodIndex(a, "MONTHLY", 1, d("2026-03-30"))).toBe(1);
    expect(periodIndex(a, "MONTHLY", 1, d("2026-03-31"))).toBe(2);
  });

  it("never returns a negative index", () => {
    expect(periodIndex(d("2026-05-01"), "WEEKLY", 1, d("2026-04-01"))).toBe(0);
  });
});

describe("terms and MRR", () => {
  it("term end is the start of the period after the last one", () => {
    expect(iso(termEnd(d("2026-03-01"), "YEARLY", 1, 1))).toBe("2027-03-01");
    expect(iso(termEnd(d("2026-10-05"), "WEEKLY", 1, 2))).toBe("2026-10-19");
  });

  it("normalises periods to a month", () => {
    expect(monthlyFactor("MONTHLY", 1)).toBe(1);
    expect(monthlyFactor("MONTHLY", 3)).toBeCloseTo(1 / 3);
    expect(monthlyFactor("YEARLY", 1)).toBeCloseTo(1 / 12);
    expect(monthlyFactor("WEEKLY", 1)).toBeCloseTo(52 / 12);
    expect(monthlyFactor("DAILY", 1)).toBeCloseTo(365 / 12);
  });
});
