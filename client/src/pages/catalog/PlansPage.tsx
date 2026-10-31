import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '../../api/client'
import { periodLabel, type BillingPeriod, type Plan } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { date, money, toMajor, toMinor } from '../../lib/format'

const FLAGS: { key: 'autoClose' | 'closable' | 'pausable' | 'renewable'; label: string; help: string }[] = [
  { key: 'autoClose', label: 'Closes automatically', help: 'Subscription closes on its expiry date' },
  { key: 'closable', label: 'Can be closed early', help: 'Staff or the customer may close it before expiry' },
  { key: 'pausable', label: 'Can be paused', help: 'Billing stops while paused' },
  { key: 'renewable', label: 'Can be renewed', help: 'Expiry can be extended by one term' },
]

export function PlansPage() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)

  const plans = useQuery({
    queryKey: ['plans', 'all'],
    queryFn: () => api.get<{ data: Plan[] }>('/plans?includeInactive=true').then((r) => r.data),
  })

  const toggle = useMutation({
    mutationFn: (p: Plan) => api.patch<Plan>(`/plans/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
    onError: (e) => applyServerError(e),
  })

  return (
    <>
      <PageHeader
        title="Recurring plans"
        subtitle="How often subscriptions bill, the base fee per period, and what customers may do with them."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New plan
            </Button>
          )
        }
      />
      <Card>
        <div className="-m-4">
          {plans.isLoading ? (
            <Spinner />
          ) : plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
          ) : plans.data!.length === 0 ? (
            <EmptyState title="No plans yet" description="Create a plan such as Monthly or Yearly to start quoting subscriptions." />
          ) : (
            <Table headers={['Plan', 'Billing', 'Base fee', 'Min qty', 'Available', 'Term', 'Rules', 'Subs', '']}>
              {plans.data!.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                  <Td className="font-medium text-slate-900">
                    {p.name} {!p.isActive && <Badge status="CLOSED" label="Inactive" />}
                  </Td>
                  <Td>{periodLabel(p.billingPeriod, p.billingInterval)}</Td>
                  <Td>{money(p.price)}</Td>
                  <Td>{p.minQuantity}</Td>
                  <Td className="text-slate-600">
                    {p.availableFrom || p.availableTo ? `${date(p.availableFrom)} → ${p.availableTo ? date(p.availableTo) : 'open'}` : 'Always'}
                  </Td>
                  <Td>{p.termLength ? `${p.termLength} period${p.termLength === 1 ? '' : 's'}` : 'Open-ended'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {FLAGS.filter((f) => p[f.key]).map((f) => (
                        <span key={f.key} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title={f.help}>
                          {f.label}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>{p._count?.subscriptions ?? 0}</Td>
                  <Td className="text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => toggle.mutate(p)} disabled={toggle.isPending}>
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name'),
    price: z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative'),
    billingPeriod: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    billingInterval: z.coerce.number().int().min(1, 'At least 1'),
    minQuantity: z.coerce.number().int().min(1, 'At least 1'),
    availableFrom: z.string(),
    availableTo: z.string(),
    termLength: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1), 'Whole number of at least 1'),
    autoClose: z.boolean(),
    closable: z.boolean(),
    pausable: z.boolean(),
    renewable: z.boolean(),
  })
  .refine((v) => !v.availableFrom || !v.availableTo || v.availableTo >= v.availableFrom, {
    path: ['availableTo'],
    message: 'Must be on or after the start date',
  })
  .refine((v) => !v.autoClose || v.termLength, { path: ['termLength'], message: 'Auto-close needs a term length to know when to close' })
type Form = z.infer<typeof schema>

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: plan
      ? {
          ...plan,
          price: toMajor(plan.price),
          availableFrom: dateInput(plan.availableFrom),
          availableTo: dateInput(plan.availableTo),
          termLength: plan.termLength ? String(plan.termLength) : '',
        }
      : { name: '', price: 0, billingPeriod: 'MONTHLY', billingInterval: 1, minQuantity: 1, availableFrom: '', availableTo: '', termLength: '', autoClose: false, closable: true, pausable: false, renewable: true },
  })

  const onSubmit = handleSubmit(async (f) => {
    const body = {
      ...f,
      price: toMinor(f.price),
      billingPeriod: f.billingPeriod as BillingPeriod,
      availableFrom: f.availableFrom || null,
      availableTo: f.availableTo || null,
      termLength: f.termLength ? Number(f.termLength) : null,
    }
    try {
      if (plan) await api.patch(`/plans/${plan.id}`, body)
      else await api.post('/plans', body)
      toast.success(plan ? 'Plan updated' : 'Plan created')
      qc.invalidateQueries({ queryKey: ['plans'] })
      onClose()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open
      title={plan ? `Edit ${plan.name}` : 'New recurring plan'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}>
          <Input autoFocus placeholder="Monthly" {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bills" error={errors.billingPeriod?.message}>
            <Select {...register('billingPeriod')}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
          </Field>
          <Field label="Every N periods" error={errors.billingInterval?.message} hint="1 = every period">
            <Input type="number" min="1" {...register('billingInterval')} />
          </Field>
          <Field label="Base fee per period (₹)" error={errors.price?.message} hint="0 if only product lines are charged">
            <Input type="number" step="0.01" min="0" {...register('price')} />
          </Field>
          <Field label="Minimum quantity" error={errors.minQuantity?.message}>
            <Input type="number" min="1" {...register('minQuantity')} />
          </Field>
          <Field label="Available from" error={errors.availableFrom?.message}>
            <Input type="date" {...register('availableFrom')} />
          </Field>
          <Field label="Available to" error={errors.availableTo?.message}>
            <Input type="date" {...register('availableTo')} />
          </Field>
          <Field label="Term length (periods)" error={errors.termLength?.message} hint="Blank = open-ended">
            <Input type="number" min="1" {...register('termLength')} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">Rules</legend>
          {FLAGS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" {...register(f.key)} />
              <span>
                <span className="font-medium text-slate-800">{f.label}</span>
                <span className="block text-xs text-slate-500">{f.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  )
}
