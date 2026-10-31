import type { BillingPeriod } from '../api/types'

/**
 * The billing period a subscription is in now, from its next billing date (the start of the
 * next period) stepped back by one period. Display only; the server owns the real period maths.
 */
export function currentPeriod(nextBillingDate: string, period: BillingPeriod, interval = 1, startDate?: string) {
  const end = new Date(nextBillingDate)
  const start = new Date(end)
  if (period === 'DAILY') start.setUTCDate(start.getUTCDate() - interval)
  else if (period === 'WEEKLY') start.setUTCDate(start.getUTCDate() - 7 * interval)
  else if (period === 'MONTHLY') start.setUTCMonth(start.getUTCMonth() - interval)
  else start.setUTCFullYear(start.getUTCFullYear() - interval)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  // Before the first invoice no period is running yet, so nothing has elapsed.
  const first = startDate !== undefined && startDate.slice(0, 10) === nextBillingDate.slice(0, 10)
  const day = first ? 0 : Math.min(days, Math.max(0, Math.round((Date.now() - start.getTime()) / 86_400_000)))
  return { start, end, day, days, daysLeft: Math.max(0, days - day), first }
}
