import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ArrowLeft, CreditCard, Printer } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import type { InvoiceListItem, Outstanding, PortalInvoice } from '../../api/types'
import { Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pagination, Spinner, Table, Td } from '../../components/ui'
import { InvoiceDocument, InvoiceStatusBadge, lastDay } from '../../components/invoice'
import { applyServerError } from '../../lib/forms'
import { date, money } from '../../lib/format'

const TABS = [
  { key: '', label: 'All' },
  { key: 'CONFIRMED', label: 'Unpaid' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'PAID', label: 'Paid' },
]

type ListResponse = Paginated<InvoiceListItem> & { counts: Record<string, number>; outstanding: Outstanding }

export function PortalInvoicesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const list = useQuery({
    queryKey: ['portal', 'invoices', { status, page }],
    queryFn: () => api.get<ListResponse>(`/portal/invoices${qs({ status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  })
  const counts = list.data?.counts ?? {}
  const due = list.data?.outstanding

  return (
    <>
      <PageHeader title="My invoices" subtitle="View, print and pay your invoices." />
      {due && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{money(due.amount)}</p>
            <p className="text-xs text-slate-500">{due.count} unpaid invoice(s)</p>
          </div>
          <div className={clsx('rounded-lg border p-4 shadow-sm', due.overdue > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
            <p className="text-xs uppercase tracking-wide text-slate-500">Overdue</p>
            <p className={clsx('mt-1 text-2xl font-semibold', due.overdue > 0 ? 'text-red-700' : 'text-slate-900')}>{money(due.overdue)}</p>
            <p className="text-xs text-slate-500">{due.overdue > 0 ? 'Past the due date — please pay as soon as you can' : 'Nothing overdue'}</p>
          </div>
        </div>
      )}
      <Card>
        <div className="-m-4">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
            {TABS.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => setParams(t.key ? { status: t.key } : {}, { replace: true })}
                className={clsx(
                  'whitespace-nowrap border-b-2 px-3 pb-2 text-sm',
                  status === t.key ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {t.label}
                {t.key && <span className="ml-1 text-xs text-slate-400">{counts[t.key] ?? 0}</span>}
              </button>
            ))}
          </div>
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState title="No invoices here" />
          ) : (
            <>
              <Table headers={['Number', 'Subscription', 'Period', 'Due', 'Status', 'Total', 'Amount due']}>
                {list.data!.data.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/portal/invoices/${i.id}`)}>
                    <Td className="font-medium text-brand-700">{i.number}</Td>
                    <Td className="text-slate-500">{i.subscription.number}</Td>
                    <Td>
                      {date(i.periodStart)} – {date(lastDay(i.periodEnd))}
                    </Td>
                    <Td className={i.overdue ? 'font-medium text-red-600' : ''}>{date(i.dueDate)}</Td>
                    <Td>
                      <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
                    </Td>
                    <Td className="text-right">{money(i.total)}</Td>
                    <Td className={clsx('text-right', i.status === 'CONFIRMED' && 'font-semibold')}>{i.status === 'CONFIRMED' ? money(i.total - i.amountPaid) : '—'}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) }, { replace: true })} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}

export function PortalInvoiceDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const key = ['portal', 'invoices', id]
  const inv = useQuery({ queryKey: key, queryFn: () => api.get<PortalInvoice>(`/portal/invoices/${id}`) })
  const [confirming, setConfirming] = useState(false)

  const pay = useMutation({
    mutationFn: () => api.post<{ paymentId: number; invoice: PortalInvoice }>(`/portal/invoices/${id}/pay`, {}),
    onSuccess: ({ invoice }) => {
      qc.setQueryData(key, invoice)
      qc.invalidateQueries({ queryKey: ['portal', 'invoices'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['portal', 'subscriptions'], refetchType: 'none' })
      toast.success(`Payment received — ${invoice.number} is paid. Thank you!`)
      setConfirming(false)
    },
    onError: (e) => {
      setConfirming(false)
      applyServerError(e)
    },
  })

  if (inv.isPending) return <Spinner />
  if (inv.isError) return <ErrorState error={inv.error} onRetry={() => inv.refetch()} />
  const i = inv.data!

  return (
    <>
      <div className="no-print">
        <Link to="/portal/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> My invoices
        </Link>
        <PageHeader
          title={i.number}
          subtitle={i.status === 'CONFIRMED' ? `${money(i.outstanding)} due ${date(i.dueDate)}` : undefined}
          actions={
            <>
              {i.status === 'CONFIRMED' && (
                <Button onClick={() => setConfirming(true)}>
                  <CreditCard className="h-4 w-4" /> Pay {money(i.outstanding)}
                </Button>
              )}
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </>
          }
        />
      </div>
      <InvoiceDocument inv={i} />
      {confirming && (
        <Modal
          open
          title="Pay invoice"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button loading={pay.isPending} onClick={() => pay.mutate()}>
                Pay {money(i.outstanding)}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            You are paying <span className="font-semibold text-slate-900">{money(i.outstanding)}</span> for {i.number}.
          </p>
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">Demo checkout: no card is charged. The payment is recorded exactly as a real one would be.</p>
        </Modal>
      )}
    </>
  )
}
