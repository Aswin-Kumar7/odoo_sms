import type { BillingPeriod } from '../api/types'

const DAY = 86_400_000

/** Steps back `months` from `end`, keeping the subscription's anchor day (clamped to month end), like the server. */
function backMonths(end: Date, months: number, anchorDay: number) {
  const y = end.getUTCFullYear()
  const m = end.getUTCMonth() - months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(anchorDay, lastDay)))
}

/**
 * The billing period a subscription is in now, from its next billing date (the start of the
 * next period) stepped back by one period. Display only; the server owns the real period maths.
 */
export function currentPeriod(nextBillingDate: string, period: BillingPeriod, interval = 1, startDate?: string) {
  const end = new Date(nextBillingDate)
  const anchorDay = new Date(startDate ?? nextBillingDate).getUTCDate()
  let start: Date
  if (period === 'DAILY') start = new Date(end.getTime() - interval * DAY)
  else if (period === 'WEEKLY') start = new Date(end.getTime() - 7 * interval * DAY)
  else start = backMonths(end, period === 'MONTHLY' ? interval : 12 * interval, anchorDay)
  const days = Math.round((end.getTime() - start.getTime()) / DAY)
  // Before the first invoice no period is running yet, so nothing has elapsed.
  const first = startDate !== undefined && startDate.slice(0, 10) === nextBillingDate.slice(0, 10)
  const elapsed = first ? 0 : Math.min(days, Math.max(0, Math.floor((Date.now() - start.getTime()) / DAY)))
  // Day 1 is the period's first day; daysLeft counts today as remaining.
  const day = first ? 0 : Math.min(days, elapsed + 1)
  return { start, end, day, days, daysLeft: Math.max(0, days - elapsed), first }
}
