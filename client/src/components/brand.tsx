import { clsx } from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePreference, useTheme, type ThemePreference } from '../lib/theme'

/** The Brightloop mark: an open loop (the billing cycle) with a point marking where you are in it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx('h-6 w-6 text-brand-600', className)} aria-hidden="true">
      <path d="M19.52 9.26A8 8 0 1 1 12 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16.59" cy="5.45" r="1.75" fill="currentColor" />
    </svg>
  )
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[17px] font-medium text-slate-900">Brightloop</span>
      {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
    </span>
  )
}

/**
 * How far a subscription is through its current billing period, drawn as a thin ring.
 * Used wherever a subscription's next invoice matters.
 */
export function CycleRing({ day, days, size = 18, className }: { day: number; days: number; size?: number; className?: string }) {
  const p = days > 0 ? Math.min(1, Math.max(0, day / days)) : 0
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 18 18" width={size} height={size} className={clsx('shrink-0 -rotate-90', className)} role="img" aria-label={`Day ${day} of ${days}`}>
      <title>{`Day ${day} of ${days} in this billing period`}</title>
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="2" />
      {p > 0 && <circle cx="9" cy="9" r={r} fill="none" stroke="var(--color-brand-600)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} />}
    </svg>
  )
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Light / dark / system, as a compact segmented control. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference } = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className={clsx('inline-flex rounded-lg border border-line bg-slate-100 p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={`${label} theme`}
          onClick={() => setThemePreference(value)}
          className={clsx(
            'flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-150',
            preference === value ? 'bg-surface text-slate-900 shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
