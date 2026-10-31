import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { api, qs, type Paginated } from '../../api/client'
import type { InvoiceListItem } from '../../api/types'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Spinner, Table, Td } from '../../components/ui'
import { InvoiceStatusBadge } from '../../components/invoice'
import { applyServerError } from '../../lib/forms'
import { date, money } from '../../lib/format'

const TABS = [
  { key: '', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'PAID', label: 'Paid' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

type ListResponse = Paginated<InvoiceListItem> & { counts: Record<string, number> }

export function InvoicesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
    setSelected(new Set())
  }

  const list = useQuery({
    queryKey: ['invoices', { status, q, page }],
    queryFn: () => api.get<ListResponse>(`/invoices${qs({ status, q, page, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  })
  const counts = list.data?.counts ?? {}
  const all = ['DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED'].reduce((a, k) => a + (counts[k] ?? 0), 0)
  const drafts = list.data?.data.filter((i) => i.status === 'DRAFT') ?? []

  const bulk = useMutation({
    mutationFn: (ids: number[]) => api.post<{ confirmed: number; skipped: number }>('/invoices/confirm-bulk', { ids }),
    onSuccess: (r) => {
      toast.success(`${r.confirmed} invoice(s) confirmed${r.skipped ? `, ${r.skipped} skipped` : ''}`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (e) => applyServerError(e),
  })

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Generated from subscriptions on each billing date. Draft → Confirmed → Paid."
        actions={
          selected.size > 0 && (
            <Button loading={bulk.isPending} onClick={() => bulk.mutate([...selected])}>
              Confirm {selected.size} selected
            </Button>
          )
        }
      />
      <Card>
        <div className="-m-4">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
            {TABS.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => set({ status: t.key })}
                className={clsx(
                  'whitespace-nowrap border-b-2 px-3 pb-2 text-sm',
                  status === t.key ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
                  t.key === 'OVERDUE' && (counts.OVERDUE ?? 0) > 0 && status !== 'OVERDUE' && 'text-red-600',
                )}
              >
                {t.label} <span className="text-xs text-slate-400">{t.key ? counts[t.key] ?? 0 : all}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <Input placeholder="Search number or customer" className="max-w-xs" defaultValue={q} onChange={(e) => set({ q: e.target.value })} />
            {drafts.length > 0 && (
              <Button variant="ghost" onClick={() => setSelected(new Set(drafts.map((d) => d.id)))}>
                Select all drafts on this page ({drafts.length})
              </Button>
            )}
          </div>
          {list.isLoading ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No invoices here" description="Run billing to generate invoices for subscriptions that are due." />
          ) : (
            <>
              <Table headers={['', 'Number', 'Customer', 'Subscription', 'Issued', 'Due', 'Status', 'Total', 'Outstanding']}>
                {list.data!.data.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/invoices/${i.id}`)}>
                    <Td>
                      {i.status === 'DRAFT' && (
                        <input type="checkbox" checked={selected.has(i.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(i.id)} aria-label={`Select ${i.number}`} />
                      )}
                    </Td>
                    <Td className="font-medium">
                      <Link to={`/invoices/${i.id}`} className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {i.number}
                      </Link>
                    </Td>
                    <Td>{i.customer.name}</Td>
                    <Td className="text-slate-500">{i.subscription.number}</Td>
                    <Td>{date(i.issueDate)}</Td>
                    <Td className={i.overdue ? 'font-medium text-red-600' : ''}>{date(i.dueDate)}</Td>
                    <Td>
                      <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
                    </Td>
                    <Td className="text-right">{money(i.total)}</Td>
                    <Td className="text-right">{i.status === 'CANCELLED' ? '—' : money(i.total - i.amountPaid)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={25} total={list.data!.total} onPage={(p) => set({ page: String(p) })} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}
