import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../../api/client'
import { periodLabel, type QuotationTemplate } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { money } from '../../lib/format'

export function TemplatesPage() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showInactive, setShowInactive] = useState(false)

  const list = useQuery({
    queryKey: ['templates', 'all'],
    queryFn: () => api.get<{ data: QuotationTemplate[] }>('/templates?includeInactive=true').then((r) => r.data),
  })

  const toggle = useMutation({
    mutationFn: (t: QuotationTemplate) => api.patch(`/templates/${t.id}`, { isActive: !t.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    onError: (e) => applyServerError(e),
  })

  const rows = list.data?.filter((t) => showInactive || t.isActive) ?? []

  return (
    <>
      <PageHeader
        title="Quotation templates"
        subtitle="Start a quote from a ready-made plan and product lines instead of building it from scratch."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
            </label>
            {isAdmin && (
              <Button onClick={() => navigate('/templates/new')}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            )}
          </>
        }
      />
      {list.isLoading ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="No templates yet" description={isAdmin ? 'Create one for your most common offer.' : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => {
            const linesValue = t.lines.reduce((sum, l) => sum + l.quantity * (l.product.salesPrice + (l.variant?.priceExtra ?? 0)), 0) + t.plan.price
            return (
              <Card
                key={t.id}
                className={t.isActive ? '' : 'opacity-60'}
                title={
                  <span className="flex items-center gap-2">
                    {t.name} {!t.isActive && <Badge status="CLOSED" label="Inactive" />}
                  </span>
                }
                actions={
                  isAdmin && (
                    <>
                      <Link to={`/templates/${t.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                        Edit
                      </Link>
                      <button className="text-sm text-slate-500 hover:underline" onClick={() => toggle.mutate(t)}>
                        {t.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )
                }
              >
                <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-slate-500">Plan</dt>
                  <dd>
                    {t.plan.name} · {periodLabel(t.plan.billingPeriod, t.plan.billingInterval).toLowerCase()}
                  </dd>
                  <dt className="text-slate-500">Quote valid for</dt>
                  <dd>{t.validityDays} days</dd>
                  <dt className="text-slate-500">Per period (before tax)</dt>
                  <dd className="font-medium">{money(linesValue)}</dd>
                  <dt className="text-slate-500">Used by</dt>
                  <dd>{t._count?.subscriptions ?? 0} subscriptions</dd>
                </dl>
                <ul className="space-y-1 border-t border-slate-100 pt-2 text-sm">
                  {t.lines.map((l) => (
                    <li key={l.id} className="flex justify-between">
                      <span>
                        {l.quantity} × {l.product.name}
                        {l.variant && <span className="text-slate-500"> ({l.variant.name})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
