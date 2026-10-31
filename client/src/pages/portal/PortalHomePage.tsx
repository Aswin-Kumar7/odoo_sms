import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowRight, Check } from 'lucide-react'
import { api, type Paginated } from '../../api/client'
import { periodLabel, type InvoiceListItem, type Outstanding, type PortalSubscription } from '../../api/types'
import { Badge, buttonClass, Card, EmptyState, ErrorState, Spinner } from '../../components/ui'
import { InvoiceStatusBadge } from '../../components/invoice'
import { currentPeriod } from '../../lib/periods'
import { date, money } from '../../lib/format'

type InvoicesResponse = Paginated<InvoiceListItem> & { outstanding: Outstanding }

/** The large cycle ring for the next invoice: how far this period has run. */
function PeriodRing({ day, days }: { day: number; days: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] shrink-0" role="img" aria-label={`Day ${day} of ${days}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="6" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0.01, (day / days) * c)} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" className="fill-slate-900 font-mono text-[22px]">
        {day}
      </text>
      <text x="60" y="76" textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">
        of {days} days
      </text>
    </svg>
  )
}

/** The next invoice drawn as a paper receipt: the one rich moment on the page. Built from the real priced lines. */
function NextInvoiceReceipt({ sub }: { sub: PortalSubscription }) {
  const t = sub.totals
  const torn = 'radial-gradient(circle at 8px 100%, transparent 6px, #000 6.5px) -8px 0 / 16px 100% repeat-x'
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div
        className="rounded-t-lg border border-b-0 border-line bg-surface px-7 pt-7 pb-9 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.18)]"
        style={{ WebkitMask: torn, mask: torn }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-900">Brightloop Software</span>
          <span className="font-mono text-[11px] text-slate-500">{sub.number}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-slate-500">
          Issued {date(sub.nextBillingDate)} · due in {sub.paymentTermDays} days
        </p>
        <div className="my-5 border-t border-dashed border-line-strong" />
        <ul className="space-y-2.5">
          {t.lines.map((l) => (
            <li key={l.key} className="flex items-baseline gap-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-slate-700">{l.description}</span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">×{l.quantity}</span>
              <span className="w-24 text-right font-mono text-slate-900 tabular-nums">{money(l.base)}</span>
            </li>
          ))}
        </ul>
        <div className="my-5 border-t border-dashed border-line-strong" />
        <dl className="space-y-1.5 font-mono text-[12px] tabular-nums">
          <div className="flex justify-between text-slate-500">
            <dt>Subtotal</dt>
            <dd>{money(t.subtotal)}</dd>
          </div>
          {t.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discounts</dt>
              <dd>−{money(t.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <dt>Tax</dt>
            <dd>{money(t.taxTotal)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-line-strong pt-4">
          <span className="text-sm text-slate-600">Total</span>
          <span className="text-2xl font-medium tracking-[-0.015em] text-slate-900 tabular-nums">{money(t.total)}</span>
        </div>
        <p className="mt-4 font-mono text-[11px] text-slate-400">Covers the billing period starting {date(sub.nextBillingDate)}</p>
      </div>
    </div>
  )
}

function PlanFacts({ sub }: { sub: PortalSubscription }) {
  const can = [sub.plan.pausable && 'Pause', sub.plan.closable && 'Close early', sub.plan.renewable && 'Renew'].filter(Boolean) as string[]
  const rows: [string, string][] = [
    ['Plan', sub.plan.name],
    ['Billing', periodLabel(sub.plan.billingPeriod, sub.plan.billingInterval)],
    ['Started', date(sub.startDate)],
    ['Renews', sub.expiryDate ? date(sub.expiryDate) : 'Open-ended'],
    ['Payment terms', sub.paymentTermDays === 0 ? 'Due on issue' : `Net ${sub.paymentTermDays} days`],
  ]
  return (
    <div className="flex h-full flex-col">
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex h-11 items-center justify-between text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-[13px] text-slate-500">This plan allows you to</p>
      {can.length ? (
        <ul className="mt-2 space-y-1.5">
          {can.map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm text-slate-700">
              <Check className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
              {c}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Contact us to change this plan</p>
      )}
      <div className="mt-6 border-t border-line pt-5">
        <Link to={`/portal/subscriptions/${sub.id}`} className={clsx(buttonClass('secondary'), 'w-full justify-center')}>
          Manage subscription
        </Link>
      </div>
    </div>
  )
}

export function PortalHomePage() {
  const subs = useQuery({ queryKey: ['portal', 'subscriptions'], queryFn: () => api.get<{ data: PortalSubscription[] }>('/portal/subscriptions') })
  const invoices = useQuery({ queryKey: ['portal', 'invoices', { status: '', page: 1 }], queryFn: () => api.get<InvoicesResponse>('/portal/invoices?pageSize=5') })

  if (subs.isPending || invoices.isPending) return <Spinner />
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
  if (invoices.isError) return <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />

  const all = subs.data.data
  const active = all.filter((s) => s.status === 'ACTIVE' && s.nextBillingDate)
  const next = [...active].sort((a, b) => a.nextBillingDate!.localeCompare(b.nextBillingDate!))[0]
  const period = next ? currentPeriod(next.nextBillingDate!, next.plan.billingPeriod, next.plan.billingInterval, next.startDate) : null
  const firstInvoice = period?.first ?? false
  const dueNow = next ? next.nextBillingDate!.slice(0, 10) <= new Date().toISOString().slice(0, 10) : false
  const due = invoices.data.outstanding
  const oldestUnpaid = [...invoices.data.data].filter((i) => i.status === 'CONFIRMED').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const company = all[0]?.customer.name

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.015em] text-slate-900">{company ?? 'Overview'}</h1>
        <p className="mt-1.5 font-mono text-xs text-slate-500">{date(new Date().toISOString())}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Next invoice: the one rich element on this page */}
        <section className="relative overflow-hidden rounded-xl border border-line bg-surface p-6">
          {next && period ? (
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <PeriodRing day={period.day} days={period.days} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-slate-500">{firstInvoice ? 'First invoice' : 'Next invoice'}</p>
                <p className="mt-1.5 text-[32px] leading-none font-medium tracking-[-0.015em] text-slate-900">{money(next.totals.total)}</p>
                <p className="mt-3 text-sm text-slate-600">
                  On {date(next.nextBillingDate)} for {next.plan.name.toLowerCase()} {next.number}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {dueNow ? 'Issued on the next billing run' : `${period.daysLeft} day${period.daysLeft === 1 ? '' : 's'} left in this period`}
                  {active.length > 1 && ` · ${active.length} active subscriptions`}
                </p>
              </div>
              <Link to={`/portal/subscriptions/${next.id}`} className="self-start text-sm font-medium text-brand-600 hover:underline sm:self-end">
                Details
              </Link>
            </div>
          ) : (
            <div className="relative">
              <p className="text-[13px] text-slate-500">Next invoice</p>
              <p className="mt-2 text-sm text-slate-600">{all.length ? 'Nothing is scheduled: none of your subscriptions is active right now.' : 'You have no subscriptions yet.'}</p>
            </div>
          )}
        </section>

        <section className={clsx('flex flex-col rounded-xl border p-6', due.overdue > 0 ? 'border-red-200 bg-red-50' : 'border-line bg-surface')}>
          <p className="text-[13px] text-slate-500">Amount due</p>
          <p className="mt-1.5 text-[32px] leading-none font-medium tracking-[-0.015em] text-slate-900">{money(due.amount)}</p>
          <p className={clsx('mt-3 font-mono text-xs', due.overdue > 0 ? 'text-red-700' : 'text-slate-500')}>
            {due.count === 0 ? 'All invoices paid' : due.overdue > 0 ? `${money(due.overdue)} overdue` : `${due.count} unpaid invoice${due.count === 1 ? '' : 's'}, none overdue`}
          </p>
          {oldestUnpaid && (
            <div className="mt-auto pt-6">
              <Link
                to={`/portal/invoices/${oldestUnpaid.id}`}
                className={buttonClass()}
              >
                Pay {oldestUnpaid.number}
              </Link>
            </div>
          )}
        </section>
      </div>

      {next && period && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="rounded-xl border border-line bg-slate-100/50 px-6 py-8">
            <p className="mb-5 text-center text-[13px] text-slate-500">{firstInvoice ? 'Your first invoice' : 'Your next invoice'}, as it will be issued</p>
            <NextInvoiceReceipt sub={next} />
          </section>
          <Card title="Your plan">
            <PlanFacts sub={next} />
          </Card>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title="Recent invoices"
          actions={
            <Link to="/portal/invoices" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900">
              All invoices <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {invoices.data.data.length === 0 ? (
            <EmptyState title="No invoices yet" description="Invoices appear here once they are issued." />
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {invoices.data.data.map((i) => (
                <li key={i.id}>
                  <Link to={`/portal/invoices/${i.id}`} className="-mx-2 flex h-14 items-center gap-4 rounded-lg px-2 transition-colors hover:bg-slate-100/60">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] text-slate-900">{i.number}</p>
                      <p className="text-xs text-slate-500">Due {date(i.dueDate)}</p>
                    </div>
                    <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
                    <span className="w-28 text-right text-sm font-medium text-slate-900">{money(i.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Subscriptions"
          actions={
            <Link to="/portal/subscriptions" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-900">
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {all.length === 0 ? (
            <EmptyState title="No subscriptions yet" description="Quotations from our team appear here." />
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {all.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link to={`/portal/subscriptions/${s.id}`} className="-mx-2 flex h-14 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-slate-100/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{s.plan.name}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {s.number} · {periodLabel(s.plan.billingPeriod, s.plan.billingInterval).toLowerCase()}
                      </p>
                    </div>
                    <Badge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
