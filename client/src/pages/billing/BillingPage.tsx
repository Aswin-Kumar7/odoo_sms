import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { api } from '../../api/client'
import type { BillingRun, RunSummary } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Spinner, Table, Td } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { date, dateTime, todayIso } from '../../lib/format'

export function BillingPage() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [asOf, setAsOf] = useState(todayIso())
  const [last, setLast] = useState<RunSummary | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const runs = useQuery({ queryKey: ['billing-runs'], queryFn: () => api.get<{ data: BillingRun[] }>('/billing/runs').then((r) => r.data) })

  const run = useMutation({
    mutationFn: () => api.post<RunSummary>('/billing/run', { asOf }),
    onSuccess: (r) => {
      setLast(r)
      qc.invalidateQueries({ queryKey: ['billing-runs'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      if (r.failedCount) toast.warning(`Run finished with ${r.failedCount} failure(s)`)
      else toast.success(r.createdCount ? `${r.createdCount} invoice(s) created` : 'Nothing due — no invoices created')
    },
    onError: (e) => applyServerError(e),
  })

  const future = asOf > todayIso()

  return (
    <>
      <PageHeader title="Billing runs" subtitle="Invoices are generated automatically every day. Each run bills every period that is due, and never the same period twice." />

      {isAdmin && (
        <Card title="Run billing" className="mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Bill everything due up to">
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </Field>
            </div>
            <Button loading={run.isPending} onClick={() => run.mutate()}>
              <Play className="h-4 w-4" /> Run billing
            </Button>
            {future && <p className="text-xs text-amber-700">Future date: simulates time passing — invoices are dated as of their billing day.</p>}
          </div>
          {last && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Invoices created" value={last.createdCount} tone="brand" />
              <Stat label="Activated" value={last.activatedCount} />
              <Stat label="Auto-closed" value={last.closedCount} />
              <Stat label="Already billed (skipped)" value={last.skippedCount} />
              <Stat label="Failed" value={last.failedCount} tone={last.failedCount ? 'red' : undefined} />
              <p className="col-span-full text-xs text-slate-500">
                Run #{last.id} as of {date(last.asOf)} took {(last.durationMs / 1000).toFixed(1)} s.
                {last.createdCount === 0 && last.failedCount === 0 && ' Every active subscription is already billed up to this date — running again never creates duplicates.'}
              </p>
            </div>
          )}
        </Card>
      )}

      <Card title="History">
        <div className="-m-5">
          {runs.isPending ? (
            <Spinner />
          ) : runs.isError ? (
            <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
          ) : runs.data!.length === 0 ? (
            <EmptyState title="No billing runs yet" />
          ) : (
            <Table headers={['Run', 'As of', 'Trigger', 'Created', 'Activated', 'Closed', 'Skipped', 'Failed', 'Duration', 'Status']}>
              {runs.data!.map((r) => {
                const secs = r.finishedAt ? ((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1) + ' s' : '—'
                return [
                  <tr key={r.id} className={r.errors.length ? 'cursor-pointer hover:bg-slate-100/60' : ''} onClick={() => r.errors.length && setExpanded(expanded === r.id ? null : r.id)}>
                    <Td>
                      #{r.id}
                      <span className="block text-xs text-slate-400">{dateTime(r.startedAt)}</span>
                    </Td>
                    <Td>{date(r.asOf)}</Td>
                    <Td>{r.trigger === 'CRON' ? 'Daily schedule' : `Manual · ${r.triggeredBy?.name ?? ''}`}</Td>
                    <Td className="font-medium">{r.createdCount}</Td>
                    <Td>{r.activatedCount}</Td>
                    <Td>{r.closedCount}</Td>
                    <Td>{r.skippedCount}</Td>
                    <Td className={r.failedCount ? 'font-medium text-red-600' : ''}>{r.failedCount}</Td>
                    <Td>{secs}</Td>
                    <Td>
                      <Badge status={r.status} />
                    </Td>
                  </tr>,
                  expanded === r.id && (
                    <tr key={`${r.id}-errors`}>
                      <td colSpan={10} className="bg-red-50 px-4 py-2 text-xs text-red-700">
                        {r.errors.map((e, i) => (
                          <p key={i}>
                            {e.subscription}: {e.message}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </Table>
          )}
        </div>
      </Card>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brand' | 'red' }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className={`text-2xl font-medium ${tone === 'brand' ? 'text-brand-700' : tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}
