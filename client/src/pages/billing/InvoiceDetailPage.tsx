import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Printer, Send } from 'lucide-react'
import { api } from '../../api/client'
import type { Invoice } from '../../api/types'
import { Button, Card, ErrorState, Field, Modal, PageHeader, Spinner, Textarea } from '../../components/ui'
import { InvoiceDocument, InvoiceStatusBadge } from '../../components/invoice'
import { Timeline } from '../../components/subscription'
import { applyServerError } from '../../lib/forms'
import { dateTime } from '../../lib/format'

export function InvoiceDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const key = ['invoices', id]
  const inv = useQuery({ queryKey: key, queryFn: () => api.get<Invoice>(`/invoices/${id}`) })
  const [cancelling, setCancelling] = useState(false)

  const act = useMutation({
    mutationFn: ({ action, reason }: { action: 'confirm' | 'cancel' | 'send'; reason?: string }) => api.post<Invoice>(`/invoices/${id}/${action}`, { reason }),
    onSuccess: (data, v) => {
      qc.setQueryData(key, data)
      qc.invalidateQueries({ queryKey: ['invoices'], refetchType: 'none' })
      qc.invalidateQueries({ queryKey: ['subscriptions'], refetchType: 'none' })
      toast.success(v.action === 'send' ? `Sent to ${data.customer.email}` : v.action === 'confirm' ? 'Invoice confirmed' : 'Invoice cancelled')
      setCancelling(false)
    },
    onError: (e) => applyServerError(e),
  })

  if (inv.isLoading) return <Spinner />
  if (inv.isError) return <ErrorState error={inv.error} onRetry={() => inv.refetch()} />
  const i = inv.data!
  const busy = act.isPending

  return (
    <>
      <div className="no-print">
        <Link to="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Invoices
        </Link>
        <PageHeader
          title={i.number}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              {i.customer.name} ·{' '}
              <Link to={`/subscriptions/${i.subscription.id}`} className="text-brand-700 hover:underline">
                {i.subscription.number}
              </Link>
              <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
              {i.sentAt && <span className="text-xs text-slate-500">Sent {dateTime(i.sentAt)}</span>}
            </span>
          }
          actions={
            <>
              {i.status === 'DRAFT' && (
                <Button loading={busy && act.variables?.action === 'confirm'} disabled={busy} onClick={() => act.mutate({ action: 'confirm' })}>
                  Confirm
                </Button>
              )}
              {(i.status === 'CONFIRMED' || i.status === 'PAID') && (
                <Button variant="secondary" loading={busy && act.variables?.action === 'send'} disabled={busy} onClick={() => act.mutate({ action: 'send' })}>
                  <Send className="h-4 w-4" /> {i.sentAt ? 'Send again' : 'Send'}
                </Button>
              )}
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              {(i.status === 'DRAFT' || i.status === 'CONFIRMED') && i.amountPaid === 0 && (
                <Button variant="secondary" disabled={busy} onClick={() => setCancelling(true)}>
                  Cancel invoice
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <InvoiceDocument inv={i} />
        </div>
        <div className="no-print space-y-6">
          <Card title="Payments">
            {i.payments.length === 0 ? (
              <p className="text-sm text-slate-500">{i.status === 'DRAFT' ? 'Confirm the invoice to start taking payments.' : 'No payments recorded yet.'}</p>
            ) : (
              <p className="text-sm text-slate-600">{i.payments.length} payment(s) recorded.</p>
            )}
          </Card>
          <Card title="Timeline">
            <Timeline entries={i.timeline} />
          </Card>
        </div>
      </div>

      {cancelling && <CancelModal loading={busy} onClose={() => setCancelling(false)} onConfirm={(reason) => act.mutate({ action: 'cancel', reason })} />}
    </>
  )
}

function CancelModal({ loading, onClose, onConfirm }: { loading: boolean; onClose: () => void; onConfirm: (reason: string | undefined) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open
      title="Cancel invoice"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={loading} onClick={() => onConfirm(reason.trim() || undefined)}>
            Cancel invoice
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Any discount uses on this invoice are released. If it is the subscription's latest period, that period will be billed again on the next billing run.
      </p>
      <Field label="Reason (optional)">
        <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong seat count" />
      </Field>
    </Modal>
  )
}
