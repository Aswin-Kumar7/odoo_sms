import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import { periodLabel, type SubscriptionListItem, type SubscriptionStatus } from '../../api/types'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Spinner, Table, Td } from '../../components/ui'
import { date, humanize } from '../../lib/format'

const TABS: (SubscriptionStatus | '')[] = ['', 'DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']

type ListResponse = Paginated<SubscriptionListItem> & { counts: Partial<Record<SubscriptionStatus, number>> }

export function SubscriptionsPage() {
  const navigate = useNavigate()
  // Filters live in the URL so a filtered view can be linked to and survives reloads.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as SubscriptionStatus | ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)
  const customerId = params.get('customerId') ?? ''

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({
    queryKey: ['subscriptions', { status, q, page, customerId }],
    queryFn: () => api.get<ListResponse>(`/subscriptions${qs({ status, q, page, pageSize: 20, customerId })}`),
    placeholderData: keepPreviousData,
  })
  const counts = list.data?.counts ?? {}
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle={customerId && list.data?.data[0] ? `Filtered to ${list.data.data[0].customer.name}` : 'Every subscription and where it stands.'}
        actions={
          <Button onClick={() => navigate('/subscriptions/new')}>
            <Plus className="h-4 w-4" /> New subscription
          </Button>
        }
      />
      <Card>
        <div className="-m-4">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
            {TABS.map((t) => (
              <button
                key={t || 'all'}
                onClick={() => set({ status: t })}
                className={clsx(
                  'whitespace-nowrap border-b-2 px-3 pb-2 text-sm',
                  status === t ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {t ? humanize(t) : 'All'} <span className="text-xs text-slate-400">{t ? counts[t] ?? 0 : all}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <Input placeholder="Search number or customer" className="max-w-xs" defaultValue={q} onChange={(e) => set({ q: e.target.value })} />
            {customerId && (
              <Button variant="ghost" onClick={() => set({ customerId: '' })}>
                Clear customer filter
              </Button>
            )}
          </div>
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No subscriptions here" description="Create one from a quotation template to get started." />
          ) : (
            <>
              <Table headers={['Number', 'Customer', 'Plan', 'Status', 'Start', 'Next bill', 'Expires']}>
                {list.data!.data.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/subscriptions/${s.id}`)}>
                    <Td className="font-medium">
                      <Link to={`/subscriptions/${s.id}`} className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.number}
                      </Link>
                    </Td>
                    <Td>{s.customer.name}</Td>
                    <Td>
                      {s.plan.name} <span className="text-xs text-slate-400">{periodLabel(s.plan.billingPeriod, s.plan.billingInterval).toLowerCase()}</span>
                    </Td>
                    <Td>
                      <Badge status={s.status} />
                    </Td>
                    <Td>{date(s.startDate)}</Td>
                    <Td>{s.status === 'ACTIVE' ? date(s.nextBillingDate) : '—'}</Td>
                    <Td>{date(s.expiryDate)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={(p) => set({ page: String(p) })} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}
