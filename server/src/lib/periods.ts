import type { BillingPeriod } from "@prisma/client";

// Billing-period arithmetic on UTC calendar dates. Pure functions — unit-tested.
//
// Monthly and yearly periods are computed from the subscription's ANCHOR date (its start
// date), not from the previous period, so month-end dates don't drift:
//   anchor Jan 31 → Feb 28 (29 in leap years) → Mar 31 → Apr 30 …

const DAY_MS = 86_400_000;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** anchor + n months, clamping the day to the target month's length. */
export function addMonthsAnchored(anchor: Date, months: number): Date {
  const total = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(total / 12);
  const month0 = ((total % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month0));
  return new Date(Date.UTC(year, month0, day));
}

/** Start of the k-th period (k = 0 is the anchor itself). */
export function periodStart(anchor: Date, period: BillingPeriod, interval: number, k: number): Date {
  const n = interval * k;
  switch (period) {
    case "DAILY":
      return new Date(anchor.getTime() + n * DAY_MS);
    case "WEEKLY":
      return new Date(anchor.getTime() + n * 7 * DAY_MS);
    case "MONTHLY":
      return addMonthsAnchored(anchor, n);
    case "YEARLY":
      return addMonthsAnchored(anchor, n * 12);
  }
}

/**
 * Index k of the period that starts on `date`, or of the last period starting before it.
 * Used to find where a billing cursor sits relative to the anchor.
 */
export function periodIndex(anchor: Date, period: BillingPeriod, interval: number, date: Date): number {
  let k: number;
  switch (period) {
    case "DAILY":
      k = Math.floor((date.getTime() - anchor.getTime()) / (DAY_MS * interval));
      break;
    case "WEEKLY":
      k = Math.floor((date.getTime() - anchor.getTime()) / (7 * DAY_MS * interval));
      break;
    case "MONTHLY":
    case "YEARLY": {
      const months = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (date.getUTCMonth() - anchor.getUTCMonth());
      k = Math.floor(months / (interval * (period === "YEARLY" ? 12 : 1)));
      break;
    }
  }
  // Clamping can place period k's start after `date` (e.g. anchor 31st); step back if so.
  while (k > 0 && periodStart(anchor, period, interval, k) > date) k--;
  return Math.max(0, k);
}

/** Start of the period after the one that starts on `current`. */
export function nextPeriodStart(anchor: Date, period: BillingPeriod, interval: number, current: Date): Date {
  return periodStart(anchor, period, interval, periodIndex(anchor, period, interval, current) + 1);
}

/** End date of a term of `periods` periods starting at anchor (exclusive end = next start). */
export function termEnd(anchor: Date, period: BillingPeriod, interval: number, periods: number): Date {
  return periodStart(anchor, period, interval, periods);
}

/** Normalises a recurring amount to a monthly figure (for MRR). */
export function monthlyFactor(period: BillingPeriod, interval: number): number {
  const perMonth = { DAILY: 365 / 12, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 }[period];
  return perMonth / interval;
}
