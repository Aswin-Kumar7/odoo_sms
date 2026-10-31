import { clsx } from 'clsx'
import { BarChart3, FileText, Repeat, Users, Wallet } from 'lucide-react'
import { LogoMark } from './brand'

// A still of the Brightloop dashboard for the landing page, built from the same tokens as the
// app so it themes with it. Figures are plausible October numbers for a few thousand customers.

const NAV = [
  { label: 'Dashboard', icon: BarChart3, active: true },
  { label: 'Subscriptions', icon: Repeat },
  { label: 'Customers', icon: Users },
  { label: 'Invoices', icon: FileText },
  { label: 'Payments', icon: Wallet },
]

const STATS = [
  { label: 'Monthly recurring revenue', value: '₹5,14,20,447', hint: 'ARR ₹61,70,45,370', accent: true },
  { label: 'Active subscriptions', value: '3,588', hint: '431 new this month' },
  { label: 'Collected this month', value: '₹5,62,44,582', hint: '₹4,84,94,670 in September' },
  { label: 'Outstanding', value: '₹5,46,86,852', hint: '1,733 overdue', danger: true },
]

// Collected per month, Nov → Oct, in lakh.
const SERIES = [118, 162, 205, 214, 288, 302, 371, 383, 452, 486, 468, 562]
const INVOICED = [146, 181, 221, 247, 293, 334, 392, 412, 471, 528, 545, 556]

function path(values: number[], w: number, h: number, max: number) {
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => [i * step, h - (v / max) * h] as const)
  return pts.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    return `${d} C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')
}

export function ProductWindow({ className }: { className?: string }) {
  const W = 640
  const H = 150
  const max = 600
  const line = path(SERIES, W, H, max)
  return (
    <div className={clsx('overflow-hidden rounded-t-2xl border border-b-0 border-line bg-slate-50 shadow-float select-none', className)} aria-hidden="true">
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-surface px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="ml-4 font-mono text-[11px] text-slate-400">billing.brightloop.in/dashboard</span>
      </div>
      <div className="flex">
        <div className="hidden w-[188px] shrink-0 border-r border-line bg-surface p-3 md:block">
          <div className="flex items-center gap-2 px-2 py-2">
            <LogoMark className="h-5 w-5" />
            <span className="text-[13px] font-medium text-slate-900">Brightloop</span>
          </div>
          <div className="mt-3 space-y-0.5">
            {NAV.map(({ label, icon: Icon, active }) => (
              <div key={label} className={clsx('flex h-7 items-center gap-2 rounded-md px-2 text-[12px]', active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-500')}>
                <Icon className={clsx('h-3.5 w-3.5', active ? 'text-brand-600' : 'text-slate-400')} strokeWidth={1.75} />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1 p-5">
          <p className="text-[22px] leading-none font-medium tracking-[-0.02em] text-slate-900">
            October <span className="text-slate-400">2026</span>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-surface p-3 shadow-card">
                <p className="truncate text-[10.5px] text-slate-500">{s.label}</p>
                <p className={clsx('mt-1.5 text-[15px] leading-none font-medium', s.accent ? 'text-brand-600' : 'text-slate-900')}>{s.value}</p>
                <p className={clsx('mt-1.5 truncate font-mono text-[9.5px]', s.danger ? 'text-red-600' : 'text-slate-500')}>{s.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-lg border border-line bg-surface p-3 shadow-card">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-medium text-slate-900">Invoiced and collected</p>
              <p className="font-mono text-[9.5px] text-slate-500">Last 12 months</p>
            </div>
            <svg viewBox={`0 -6 ${W} ${H + 12}`} className="mt-3 h-[120px] w-full" preserveAspectRatio="none">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--color-brand-600)" opacity="0.1" />
              <path d={path(INVOICED, W, H, max)} fill="none" stroke="var(--color-slate-400)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <path d={line} fill="none" stroke="var(--color-brand-600)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
