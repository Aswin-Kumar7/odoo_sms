import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { api, qs } from '../api/client'
import { paymentMethodLabel, type PaymentMethod } from '../api/types'
import { useActivePlans } from '../api/lookups'
import { Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Table, Td } from '../components/ui'
import { date, humanize, money, todayIso } from '../lib/format'

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
  { key: 'month', label: 'This month' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
  { key: '12m', label: 'Last 12 months' },
]

const STATUS_ORDER = ['ACTIVE', 'PAUSED', 'CONFIRMED', 'QUOTATION', 'DRAFT', 'CLOSED']
const STATUS_BAR: Record<string, string> = {
  ACTIVE: 'bg-emerald-500',
  PAUSED: 'bg-amber-400',
  CONFIRMED: 'bg-indigo-400',
  QUOTATION: 'bg-sky-400',
  DRAFT: 'bg-slate-300',
  CLOSED: 'bg-slate-400',
}

const compact = (minor: number) => {
  const v = minor / 100
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`
  return `₹${v.toFixed(0)}`
}

function Kpi({ label, value, hint, tone, to }: { label: string; value: string; hint?: ReactNode; tone?: 'danger'; to?: string }) {
  const body = (
    <div className={clsx('h-full rounded-lg border p-4 shadow-sm transition-colors', tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white', to && 'hover:border-brand-500')}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={clsx('mt-1 text-2xl font-semibold', tone === 'danger' ? 'text-red-700' : 'text-slate-900')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const preset = params.get('range') ?? 'month'
  const planId = params.get('planId') ?? ''
  const custom = preset === 'custom'
  const range = custom ? { from: params.get('from') ?? presetRange('month').from, to: params.get('to') ?? todayIso() } : presetRange(preset)
  const plans = useActivePlans()

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
  const statusMax = s ? Math.max(1, ...Object.values(s.subscriptions.byStatus)) : 1
  const methodMax = s ? Math.max(1, ...s.paymentsByMethod.map((m) => m.amount)) : 1
  const rangeLabel = custom ? `${date(range.from)} – ${date(range.to)}` : PRESETS.find((p) => p.key === preset)?.label.toLowerCase()

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Recurring revenue, collections and overdue invoices in one place." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period">
            <Select value={preset} onChange={(e) => set({ range: e.target.value === 'month' ? '' : e.target.value, ...(e.target.value === 'custom' ? range : { from: '', to: '' }) })}>
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom range</option>
            </Select>
          </Field>
          {custom && (
            <>
              <Field label="From">
                <Input type="date" value={range.from} max={range.to} onChange={(e) => set({ from: e.target.value })} />
              </Field>
              <Field label="To">
                <Input type="date" value={range.to} min={range.from} onChange={(e) => set({ to: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Plan">
            <Select value={planId} onChange={(e) => set({ planId: e.target.value })}>
              <option value="">All plans</option>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {summary.isFetching && <span className="pb-2 text-xs text-slate-400">Updating…</span>}
        </div>
      </Card>

      {summary.isLoading ? (
        <Spinner />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        s && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Active subscriptions" value={s.subscriptions.active.toLocaleString('en-IN')} hint={`${s.subscriptions.byStatus.PAUSED ?? 0} paused · ${s.subscriptions.total.toLocaleString('en-IN')} in total`} to={`/subscriptions?status=ACTIVE`} />
              <Kpi label="MRR" value={money(s.mrr)} hint="Monthly recurring revenue, before tax" />
              <Kpi label="ARR" value={money(s.arr)} hint="MRR × 12" />
              <Kpi label={`Collected (${rangeLabel})`} value={money(s.collected.amount)} hint={`${s.collected.count.toLocaleString('en-IN')} payment(s)`} to="/payments" />
            </div>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label={`Invoiced (${rangeLabel})`} value={money(s.invoiced.amount)} hint={`${s.invoiced.count.toLocaleString('en-IN')} confirmed invoice(s)`} to="/invoices" />
              <Kpi label="Outstanding" value={money(s.outstanding.amount)} hint={`${s.outstanding.count.toLocaleString('en-IN')} unpaid invoice(s)`} to="/invoices?status=CONFIRMED" />
              <Kpi
                label="Overdue"
                value={money(s.overdue.amount)}
                hint={`${s.overdue.count.toLocaleString('en-IN')} invoice(s) past due`}
                tone={s.overdue.count > 0 ? 'danger' : undefined}
                to="/invoices?status=OVERDUE"
              />
              <Kpi
                label="Drafts to confirm"
                value={s.draftInvoices.toLocaleString('en-IN')}
                hint={`${s.subscriptions.createdInRange} new · ${s.subscriptions.closedInRange} closed subscriptions (${rangeLabel})`}
                to="/invoices?status=DRAFT"
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card title="Invoiced vs collected — last 12 months" className="xl:col-span-2">
                {trend.isError ? (
                  <ErrorState error={trend.error} onRetry={() => trend.refetch()} />
                ) : !trend.data ? (
                  <Spinner />
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" tickFormatter={(m: string) => new Date(m + '-01T00:00:00Z').toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tickFormatter={compact} width={56} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip
                          formatter={(v) => money(Number(v))}
                          labelFormatter={(m) => new Date(String(m) + '-01T00:00:00Z').toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="invoiced" name="Invoiced" fill="#714b67" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="collected" name="Collected" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card title="Subscriptions by status">
                <ul className="space-y-3 text-sm">
                  {STATUS_ORDER.map((st) => {
                    const count = s.subscriptions.byStatus[st] ?? 0
                    return (
                      <li key={st}>
                        <Link to={`/subscriptions?status=${st}`} className="block hover:opacity-80">
                          <div className="mb-1 flex justify-between">
                            <span className="text-slate-700">{humanize(st)}</span>
                            <span className="font-medium">{count.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div className={clsx('h-2 rounded-full', STATUS_BAR[st])} style={{ width: `${(count / statusMax) * 100}%` }} />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card title={`Payments by method (${rangeLabel})`}>
                {s.paymentsByMethod.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments in this period.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {s.paymentsByMethod.map((m) => (
                      <li key={m.method}>
                        <div className="mb-1 flex justify-between">
                          <span className="text-slate-700">
                            {paymentMethodLabel(m.method)} <span className="text-xs text-slate-400">× {m.count}</span>
                          </span>
                          <span className="font-medium">{money(m.amount)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(m.amount / methodMax) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" /> Oldest overdue invoices
                  </span>
                }
                actions={
                  <Link to="/invoices?status=OVERDUE" className="text-sm text-brand-700 hover:underline">
                    View all
                  </Link>
                }
                className="xl:col-span-2"
              >
                {s.topOverdue.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing is overdue.</p>
                ) : (
                  <div className="-m-4">
                    <Table headers={['Invoice', 'Customer', 'Due', 'Days overdue', 'Outstanding']}>
                      {s.topOverdue.map((i) => (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <Td>
                            <Link to={`/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                              {i.number}
                            </Link>
                          </Td>
                          <Td>{i.customer.name}</Td>
                          <Td>{date(i.dueDate)}</Td>
                          <Td className="font-medium text-red-600">{i.daysOverdue}</Td>
                          <Td className="text-right font-medium">{money(i.outstanding)}</Td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )
      )}
    </>
  )
}
