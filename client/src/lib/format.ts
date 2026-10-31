// Money arrives from the API as integer minor units (paise).
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export const money = (minor: number | null | undefined) => inr.format((minor ?? 0) / 100)

export const toMinor = (major: number) => Math.round(major * 100)
export const toMajor = (minor: number) => minor / 100

export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const percent = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`

/** Today as YYYY-MM-DD in UTC (billing dates are calendar dates). */
export const todayIso = () => new Date().toISOString().slice(0, 10)

export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
