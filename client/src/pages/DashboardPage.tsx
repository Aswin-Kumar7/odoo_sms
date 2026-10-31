import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { api, qs } from '../api/client'
import { paymentMethodLabel, type PaymentMethod } from '../api/types'
import { useActivePlans } from '../api/lookups'
import { Card, ErrorState, Input, Select, Spinner, Stat, Table, Td } from '../components/ui'
import { date, humanize, money, todayIso } from '../lib/format'
import { useTheme } from '../lib/theme'

interface Summary {
  range: { from: string; to: string }
  subscriptions: { active: number; byStatus: Record<string, number>; total: number; createdInRange: number; closedInRange: number }
  mrr: number
  arr: number
  invoiced: { amount: number; count: number }
  collected: { amount: number; count: number }
  outstanding: { amount: number; count: number }
  overdue: { amount: number; count: number }
  draftInvoices: number
  paymentsByMethod: { method: PaymentMethod; count: number; amount: number }[]
  topOverdue: { id: number; number: string; dueDate: string; outstanding: number; daysOverdue: number; customer: { id: number; name: string } }[]
}

type TrendPoint = { month: string; invoiced: number; collected: number }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function presetRange(preset: string): { from: string; to: string } {
  const t = new Date(todayIso() + 'T00:00:00Z')
  const daysAgo = (n: number) => iso(new Date(t.getTime() - n * 86_400_000))
  switch (preset) {
    case '30d':
      return { from: daysAgo(29), to: iso(t) }
    case '90d':
      return { from: daysAgo(89), to: iso(t) }
    case 'year':
      return { from: `${t.getUTCFullYear()}-01-01`, to: iso(t) }
    case '12m':
      return { from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 11, 1))), to: iso(t) }
    default:
      return { from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), to: iso(t) }
  }
}

const PRESETS = [
  { key: 'month', label: 'Month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'Year' },
  { key: '12m', label: '12 months' },
  { key: 'custom', label: 'Custom' },
]

const STATUS_ORDER = ['ACTIVE', 'PAUSED', 'CONFIRMED', 'QUOTATION', 'DRAFT', 'CLOSED']

const compact = (minor: number) => {
  const v = minor / 100
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(0)}L`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
  return v.toFixed(0)
}
const monthShort = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)

// Chart ink per theme: the accent marks collected money, invoiced stays a neutral reference.
const CHART = {
  light: { accent: '#714b67', fill: 'rgb(113 75 103 / 0.12)', neutral: '#9f9fa6', grid: 'rgb(23 23 25 / 0.07)', tick: '#6f6f76' },
  dark: { accent: '#c99dbd', fill: 'rgb(201 157 189 / 0.14)', neutral: '#8b8b92', grid: 'rgb(237 237 238 / 0.07)', tick: '#8b8b92' },
}

/** A ranked row with a thin bar: the secondary data shape on this page. */
function BarRow({ label, value, share, accent, to }: { label: string; value: string; share: number; accent?: boolean; to?: string }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-mono text-[13px] text-slate-900">{value}</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-slate-100">
        <div className={clsx('animate-bar h-1 rounded-full', accent ? 'bg-brand-600' : 'bg-slate-400')} style={{ width: `${Math.max(share * 100, share > 0 ? 1.5 : 0)}%` }} />
      </div>
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className="-mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100/60">
          {body}
        </Link>
      ) : (
        <div className="py-1.5">{body}</div>
      )}
    </li>
  )
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const preset = params.get('range') ?? 'month'
  const planId = params.get('planId') ?? ''
  const custom = preset === 'custom'
  const range = custom ? { from: params.get('from') ?? presetRange('month').from, to: params.get('to') ?? todayIso() } : presetRange(preset)
  const plans = useActivePlans()
  const { theme } = useTheme()
  const ink = CHART[theme]

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    setParams(next, { replace: true })
  }

  const summary = useQuery({
    queryKey: ['reports', 'summary', range.from, range.to, planId],
    queryFn: () => api.get<Summary>(`/reports/summary${qs({ from: range.from, to: range.to, planId })}`),
    placeholderData: keepPreviousData,
    enabled: range.from <= range.to,
  })
  const trend = useQuery({
    queryKey: ['reports', 'trend', planId],
    queryFn: () => api.get<TrendPoint[]>(`/reports/revenue-trend${qs({ planId })}`),
    placeholderData: keepPreviousData,
  })

  const s = summary.data
  const now = new Date(todayIso() + 'T00:00:00Z')
  const presetLabel = PRESETS.find((p) => p.key === preset)?.label ?? ''
  const titleMain = preset === 'month' ? MONTHS[now.getUTCMonth()] : preset === 'year' ? String(now.getUTCFullYear()) : custom ? 'Custom range' : `Last ${presetLabel.toLowerCase()}`
  const titleMuted = preset === 'month' ? String(now.getUTCFullYear()) : preset === 'year' ? 'to date' : ''
  const rangeLabel = preset === 'month' ? 'this month' : preset === 'year' ? 'this year' : custom ? 'in range' : `in the last ${presetLabel.toLowerCase()}`
  // The month before, as a whole month: the one comparison that is fair against a month to date.
  const prevMonth = trend.data && trend.data.length > 1 ? trend.data[trend.data.length - 2] : null
  const statusMax = s ? Math.max(1, ...Object.values(s.subscriptions.byStatus)) : 1
  const methodMax = s ? Math.max(1, ...s.paymentsByMethod.map((m) => m.amount)) : 1
  const planName = plans.data?.find((p) => String(p.id) === planId)?.name

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-none font-medium tracking-[-0.02em] text-slate-900">
            {titleMain} {titleMuted && <span className="text-slate-400">{titleMuted}</span>}
          </h1>
          <p className="mt-2.5 text-sm text-slate-500">
            {custom ? `${date(range.from)} – ${date(range.to)} · ` : ''}
            {planName ? `${planName} plan` : 'All plans'}
            {summary.isFetching && !summary.isPending && <span className="ml-2 font-mono text-xs text-slate-400">Updating</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Period" className="inline-flex flex-wrap rounded-lg border border-line bg-slate-100 p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                role="radio"
                aria-checked={preset === p.key}
                onClick={() => set({ range: p.key === 'month' ? '' : p.key, ...(p.key === 'custom' ? range : { from: '', to: '' }) })}
                className={clsx(
                  'h-7 rounded-md px-2.5 text-[13px] transition-colors duration-150',
                  preset === p.key ? 'bg-surface font-medium text-slate-900 shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {custom && (
            <>
              <div className="w-[150px]">
                <Input type="date" aria-label="From" className="h-8" value={range.from} max={range.to} onChange={(e) => set({ from: e.target.value })} />
              </div>
              <div className="w-[150px]">
                <Input type="date" aria-label="To" className="h-8" value={range.to} min={range.from} onChange={(e) => set({ to: e.target.value })} />
              </div>
            </>
          )}
          <div className="w-[170px]">
            <Select aria-label="Plan" className="h-8 text-[13px]" value={planId} onChange={(e) => set({ planId: e.target.value })}>
              <option value="">All plans</option>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {summary.isPending ? (
        <Spinner />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        s && (
          <>
            {s.draftInvoices > 0 && (
              <Link
                to="/invoices?status=DRAFT"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-100/60"
              >
                <span>
                  <span className="font-medium text-slate-900">{s.draftInvoices.toLocaleString('en-IN')} draft invoices</span> are waiting to be confirmed before customers see them
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-slate-500">
                  Review <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            )}

            <div className="mb-4 grid grid-cols-1 gap-4 stagger-children sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Monthly recurring revenue" value={money(s.mrr)} tone="accent" hint={`ARR ${money(s.arr)}`} />
              <Stat
                label="Active subscriptions"
                value={s.subscriptions.active.toLocaleString('en-IN')}
                hint={`${s.subscriptions.createdInRange.toLocaleString('en-IN')} new, ${s.subscriptions.closedInRange.toLocaleString('en-IN')} closed ${rangeLabel}`}
              />
              <Stat
                label={`Collected ${rangeLabel}`}
                value={money(s.collected.amount)}
                hint={preset === 'month' && !planId && prevMonth ? `${money(prevMonth.collected)} in all of ${MONTHS[Number(prevMonth.month.slice(5, 7)) - 1]}` : `${s.collected.count.toLocaleString('en-IN')} payments`}
              />
              <Link to="/invoices?status=OVERDUE" className="block rounded-xl [&>div]:transition-colors [&>div]:hover:border-line-strong">
                <Stat
                  className="h-full"
                  label="Outstanding"
                  value={money(s.outstanding.amount)}
                  hint={
                    <span className={s.overdue.count > 0 ? 'text-red-600' : undefined}>
                      {s.overdue.count > 0 ? `${money(s.overdue.amount)} overdue in ${s.overdue.count.toLocaleString('en-IN')} invoices` : 'Nothing overdue'}
                    </span>
                  }
                />
              </Link>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card
                title="Invoiced and collected"
                actions={
                  <div className="flex items-center gap-4 font-mono text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: ink.accent }} /> Collected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: ink.neutral }} /> Invoiced
                    </span>
                  </div>
                }
              >
                {trend.isError ? (
                  <ErrorState error={trend.error} onRetry={() => trend.refetch()} />
                ) : !trend.data ? (
                  <Spinner />
                ) : (
                  <>
                    <p className="text-[13px] text-slate-500">Collected in the last 12 months</p>
                    <p className="mt-1.5 text-[26px] leading-none font-medium tracking-[-0.01em] text-slate-900">{money(trend.data.reduce((a, m) => a + m.collected, 0))}</p>
                    <div className="mt-6 h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trend.data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={ink.grid} vertical={false} />
                          <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: ink.tick, fontFamily: 'var(--font-mono)' }} dy={8} />
                          <YAxis tickFormatter={compact} width={44} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: ink.tick, fontFamily: 'var(--font-mono)' }} />
                          <Tooltip
                            cursor={{ stroke: ink.grid, strokeWidth: 1 }}
                            content={({ active, payload, label }) =>
                              active && payload?.length ? (
                                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[0_8px_24px_rgb(0_0_0/0.12)]">
                                  <p className="mb-1 font-medium text-slate-900">
                                    {MONTHS[Number(String(label).slice(5, 7)) - 1]} {String(label).slice(0, 4)}
                                  </p>
                                  {payload.map((p) => (
                                    <p key={String(p.dataKey)} className="flex justify-between gap-6 font-mono text-slate-600">
                                      <span>{p.dataKey === 'collected' ? 'Collected' : 'Invoiced'}</span>
                                      <span className="text-slate-900">{money(Number(p.value))}</span>
                                    </p>
                                  ))}
                                </div>
                              ) : null
                            }
                          />
                          <Area type="monotone" dataKey="collected" stroke={ink.accent} strokeWidth={2} fill={ink.fill} activeDot={{ r: 4, strokeWidth: 0, fill: ink.accent }} />
                          <Line type="monotone" dataKey="invoiced" stroke={ink.neutral} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: ink.neutral }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </Card>

              <Card title="Subscriptions by status" actions={<span className="font-mono text-xs text-slate-500">{s.subscriptions.total.toLocaleString('en-IN')} total</span>}>
                <ul className="space-y-1">
                  {STATUS_ORDER.map((st) => {
                    const count = s.subscriptions.byStatus[st] ?? 0
                    return <BarRow key={st} label={humanize(st)} value={count.toLocaleString('en-IN')} share={count / statusMax} accent={st === 'ACTIVE'} to={`/subscriptions?status=${st}`} />
                  })}
                </ul>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card
                title="Oldest overdue invoices"
                actions={
                  <Link to="/invoices?status=OVERDUE" className="link-draw inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900">
                    All overdue <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              >
                {s.topOverdue.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing is overdue</p>
                ) : (
                  <div className="-m-5">
                    <Table
                      headers={[
                        'Invoice',
                        'Customer',
                        'Due',
                        'Late by',
                        <span key="o" className="block text-right">
                          Outstanding
                        </span>,
                      ]}
                    >
                      {s.topOverdue.map((i) => (
                        <tr key={i.id} className="hover:bg-slate-100/60">
                          <Td>
                            <Link to={`/invoices/${i.id}`} className="font-mono text-[13px] text-slate-900 hover:underline">
                              {i.number}
                            </Link>
                          </Td>
                          <Td className="max-w-[220px] truncate">{i.customer.name}</Td>
                          <Td className="text-slate-500">{date(i.dueDate)}</Td>
                          <Td className="font-mono text-[13px] text-red-600">{i.daysOverdue} days</Td>
                          <Td className="text-right font-medium text-slate-900">{money(i.outstanding)}</Td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
              </Card>

              <Card title={`Payments by method ${rangeLabel}`}>
                {s.paymentsByMethod.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments in this period</p>
                ) : (
                  <ul className="space-y-1">
                    {s.paymentsByMethod.map((m, i) => (
                      <BarRow key={m.method} label={`${paymentMethodLabel(m.method)} · ${m.count.toLocaleString('en-IN')}`} value={money(m.amount)} share={m.amount / methodMax} accent={i === 0} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )
      )}
    </>
  )
}
