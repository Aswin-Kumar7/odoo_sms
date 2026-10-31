import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, CalendarClock, Repeat } from 'lucide-react'
import { api } from '../../api/client'
import { periodLabel, type PortalSubscription, type SubscriptionAction } from '../../api/types'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, Table, Td } from '../../components/ui'
import { ReasonModal, StatusStepper, Timeline, TotalsTable } from '../../components/subscription'
import { InvoiceStatusBadge, lastDay } from '../../components/invoice'
import { applyServerError } from '../../lib/forms'
import { date, money } from '../../lib/format'

const DONE_TEXT: Partial<Record<SubscriptionAction, string>> = {
  pause: 'Subscription paused. You will not be billed while it is paused.',
  resume: 'Subscription resumed',
  close: 'Subscription closed',
  renew: 'Subscription renewed for another term',
}

/** Self-service buttons for the actions the customer's plan allows; blocked ones explain why. */
function SelfServiceActions({ sub }: { sub: PortalSubscription }) {
  const qc = useQueryClient()
  const [closing, setClosing] = useState(false)
  const act = useMutation({
    mutationFn: ({ action, reason }: { action: SubscriptionAction; reason?: string }) =>
      api.post<PortalSubscription>(`/portal/subscriptions/${sub.id}/${action}`, { version: sub.version, reason }),
    onSuccess: (data, v) => {
      qc.setQueryData(['portal', 'subscriptions', String(sub.id)], data)
      qc.invalidateQueries({ queryKey: ['portal', 'subscriptions'] })
      toast.success(DONE_TEXT[v.action] ?? 'Done')
      setClosing(false)
    },
    onError: (e) => applyServerError(e),
  })
  if (sub.actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {sub.actions.map((a) => (
        <Button
          key={a.action}
          variant={a.action === 'close' ? 'secondary' : 'primary'}
          disabled={!!a.blockedReason || act.isPending}
          loading={act.isPending && act.variables?.action === a.action}
          title={a.blockedReason ?? undefined}
          onClick={() => (a.action === 'close' ? setClosing(true) : act.mutate({ action: a.action }))}
        >
          {a.label}
        </Button>
      ))}
      {sub.actions.some((a) => a.blockedReason) && (
        <p className="w-full text-xs text-slate-500">
          {sub.actions
            .filter((a) => a.blockedReason)
            .map((a) => `${a.label}: ${a.blockedReason}`)
            .join(' · ')}
        </p>
      )}
      {closing && <ReasonModal title="Close subscription" loading={act.isPending} onClose={() => setClosing(false)} onConfirm={(reason) => act.mutate({ action: 'close', reason })} />}
    </div>
  )
}

export function PortalSubscriptionsPage() {
  const list = useQuery({ queryKey: ['portal', 'subscriptions'], queryFn: () => api.get<{ data: PortalSubscription[] }>('/portal/subscriptions') })

  return (
    <>
      <PageHeader title="My subscriptions" subtitle="Pause, resume, renew or close where your plan allows it — no email needed." />
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data!.data.length === 0 ? (
        <Card>
          <EmptyState title="No subscriptions yet" description="Once our team sends you a quotation it will appear here." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data!.data.map((s) => (
            <Card
              key={s.id}
              title={
                <Link to={`/portal/subscriptions/${s.id}`} className="text-brand-700 hover:underline">
                  {s.number}
                </Link>
              }
              actions={<Badge status={s.status} />}
            >
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-slate-800">
                  <Repeat className="h-4 w-4 text-slate-400" /> {s.plan.name} · {periodLabel(s.plan.billingPeriod, s.plan.billingInterval)}
                </p>
                <p className="text-slate-600">{s.totals.lines.map((l) => (l.quantity > 1 ? `${l.quantity} × ${l.description}` : l.description)).join(', ')}</p>
                <dl className="grid grid-cols-2 gap-y-1">
                  <dt className="text-slate-500">Per period</dt>
                  <dd className="text-right font-semibold">{money(s.totals.total)}</dd>
                  {s.status === 'ACTIVE' && s.nextBillingDate && (
                    <>
                      <dt className="text-slate-500">Next invoice</dt>
                      <dd className="text-right">{date(s.nextBillingDate)}</dd>
                    </>
                  )}
                  {s.status === 'QUOTATION' && s.quoteExpiresAt && (
                    <>
                      <dt className="text-slate-500">Quote valid until</dt>
                      <dd className="text-right">{date(s.quoteExpiresAt)}</dd>
                    </>
                  )}
                  {s.expiryDate && (
                    <>
                      <dt className="text-slate-500">{s.status === 'CLOSED' ? 'Ended' : 'Expires'}</dt>
                      <dd className="text-right">{date(s.closedAt ?? s.expiryDate)}</dd>
                    </>
                  )}
                </dl>
                {s.status === 'PAUSED' && (
                  <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                    <CalendarClock className="h-4 w-4" /> Paused since {date(s.pausedAt)} — no invoices while paused.
                  </p>
                )}
                <SelfServiceActions sub={s} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

export function PortalSubscriptionDetailPage() {
  const { id } = useParams()
  const sub = useQuery({ queryKey: ['portal', 'subscriptions', id], queryFn: () => api.get<PortalSubscription>(`/portal/subscriptions/${id}`) })

  if (sub.isLoading) return <Spinner />
  if (sub.isError) return <ErrorState error={sub.error} onRetry={() => sub.refetch()} />
  const s = sub.data!

  return (
    <>
      <Link to="/portal/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> My subscriptions
      </Link>
      <PageHeader title={s.number} subtitle={`${s.plan.name} · ${periodLabel(s.plan.billingPeriod, s.plan.billingInterval)}`} actions={<Badge status={s.status} />} />
      <div className="mb-6">
        <StatusStepper status={s.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="What you pay each period" actions={<span className="text-xs text-slate-500">Priced on {date(s.pricedOn)}</span>}>
            <TotalsTable totals={s.totals} />
          </Card>
          <Card title="Invoices">
            {s.invoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices yet.</p>
            ) : (
              <div className="-m-4">
                <Table headers={['Number', 'Period', 'Due', 'Status', 'Total']}>
                  {s.invoices.map((i) => (
                    <tr key={i.id}>
                      <Td>
                        <Link to={`/portal/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                          {i.number}
                        </Link>
                      </Td>
                      <Td>
                        {date(i.periodStart)} – {date(lastDay(i.periodEnd))}
                      </Td>
                      <Td>{date(i.dueDate)}</Td>
                      <Td>
                        <InvoiceStatusBadge status={i.status} />
                      </Td>
                      <Td className="text-right">{money(i.total)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Start date</dt>
                <dd>{date(s.startDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Expiry</dt>
                <dd>{s.expiryDate ? date(s.expiryDate) : 'Open-ended'}</dd>
              </div>
              {s.status === 'ACTIVE' && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Next invoice</dt>
                  <dd>{date(s.nextBillingDate)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Payment terms</dt>
                <dd>{s.paymentTermDays} days</dd>
              </div>
              {s.closeReason && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Closed</dt>
                  <dd className="text-right">{s.closeReason}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4">
              <SelfServiceActions sub={s} />
            </div>
          </Card>
          <Card title="History">
            <Timeline entries={s.timeline} />
          </Card>
        </div>
      </div>
    </>
  )
}
