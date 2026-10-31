import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, qs, type Paginated } from '../../api/client'
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentListItem, type PaymentSummary } from '../../api/types'
import { Card, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Select, Spinner, Stat, Table, Td } from '../../components/ui'
import { date, money } from '../../lib/format'

type ListResponse = Paginated<PaymentListItem> & { summary: PaymentSummary }

export function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const method = params.get('method') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({
    queryKey: ['payments', { method, from, to, q, page }],
    queryFn: () => api.get<ListResponse>(`/payments${qs({ method, from, to, q, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  })
  const summary = list.data?.summary

  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment recorded against an invoice, by the team or through the customer portal" />

      {summary && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={`Collected${from || to || method || q ? ', filtered' : ''}`} value={money(summary.amount)} hint={`${summary.count.toLocaleString('en-IN')} payments`} />
          {summary.byMethod.slice(0, 3).map((m) => (
            <Stat key={m.method} label={paymentMethodLabel(m.method)} value={money(m.amount)} hint={`${m.count.toLocaleString('en-IN')} payments`} />
          ))}
        </div>
      )}

      <Card>
        <div className="-m-5">
          <div className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <Input placeholder="Invoice, customer or note" defaultValue={q} onChange={(e) => set({ q: e.target.value })} />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => set({ method: e.target.value })}>
                <option value="">All methods</option>
                {[...PAYMENT_METHODS, { value: 'ONLINE_SIMULATED' as const, label: 'Online (portal)' }].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid from">
              <Input type="date" value={from} onChange={(e) => set({ from: e.target.value })} />
            </Field>
            <Field label="Paid to">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
            </Field>
          </div>
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No payments found" description="Record a payment from a confirmed invoice, or change the filters." />
          ) : (
            <>
              <Table headers={['Paid on', 'Invoice', 'Customer', 'Method', 'Note', 'Recorded by', 'Amount']}>
                {list.data!.data.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-100/60">
                    <Td>{date(p.paidOn)}</Td>
                    <Td className="font-medium">
                      <Link to={`/invoices/${p.invoice.id}`} className="text-brand-700 hover:underline">
                        {p.invoice.number}
                      </Link>
                    </Td>
                    <Td>{p.invoice.customer.name}</Td>
                    <Td>{paymentMethodLabel(p.method)}</Td>
                    <Td className="max-w-56 truncate text-slate-500">{p.note ?? '—'}</Td>
                    <Td className="text-slate-500">{p.recordedBy?.role === 'CUSTOMER' ? 'Customer (portal)' : p.recordedBy?.name ?? '—'}</Td>
                    <Td className="text-right font-medium">{money(p.amount)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={25} total={list.data!.total} onPage={(n) => set({ page: String(n) })} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}
