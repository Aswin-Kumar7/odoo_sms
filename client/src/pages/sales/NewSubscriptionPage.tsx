import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { api, qs, type Paginated } from '../../api/client'
import { periodLabel, type Customer, type Subscription } from '../../api/types'
import { useActivePlans, useActiveTemplates } from '../../api/lookups'
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { todayIso } from '../../lib/format'
import { CustomerModal } from './CustomersPage'

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    source: z.enum(['template', 'plan']),
    templateId: z.string(),
    planId: z.string(),
    startDate: z.string().min(1, 'Choose a start date'),
    paymentTermDays: z.coerce.number().int().min(0).max(365),
    notes: z.string().optional(),
  })
  .refine((v) => (v.source === 'template' ? v.templateId : v.planId), { path: ['templateId'], message: 'Choose a template or a plan' })
type Form = z.infer<typeof schema>

export function NewSubscriptionPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')

  // Server-side search keeps the picker fast with thousands of customers.
  const customers = useQuery({
    queryKey: ['customers', 'picker', customerSearch],
    queryFn: () => api.get<Paginated<Customer>>(`/customers${qs({ pageSize: 25, q: customerSearch })}`).then((r) => r.data),
    placeholderData: keepPreviousData,
  })
  const templates = useActiveTemplates()

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { customerId: '', source: 'template', templateId: '', planId: '', startDate: todayIso(), paymentTermDays: 15, notes: '' },
  })
  const source = watch('source')
  // Only plans that can be sold on the chosen start date are offered.
  const plans = useActivePlans(watch('startDate') || undefined)
  const template = templates.data?.find((t) => String(t.id) === watch('templateId'))

  const onSubmit = handleSubmit(async (f) => {
    const body = {
      customerId: Number(f.customerId),
      startDate: f.startDate,
      paymentTermDays: f.paymentTermDays,
      notes: f.notes || null,
      ...(f.source === 'template' ? { templateId: Number(f.templateId) } : { planId: Number(f.planId), lines: [] }),
    }
    try {
      const sub = await api.post<Subscription>('/subscriptions', body)
      toast.success(`${sub.number} created as a draft`)
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      navigate(`/subscriptions/${sub.id}`, { replace: true })
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <Link to="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Subscriptions
      </Link>
      <PageHeader title="New subscription" subtitle="It starts as a draft. You can adjust lines before sending the quotation." />
      <Card>
        <div className="space-y-4">
          <Field label="Customer" error={errors.customerId?.message}>
            <Input placeholder="Search customers by name or email" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="mb-2" />
            <div className="flex gap-2">
              <Select {...register('customerId')}>
                <option value="">Choose a customer…</option>
                {customers.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={() => setAddingCustomer(true)}>
                New
              </Button>
            </div>
          </Field>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="template" {...register('source')} /> From a quotation template
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="plan" {...register('source')} /> Blank, choose a plan
            </label>
          </div>

          {source === 'template' ? (
            <Field label="Quotation template" error={errors.templateId?.message}>
              <Select {...register('templateId')}>
                <option value="">Choose a template…</option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.plan.name}, {t.lines.length} lines, valid {t.validityDays} days
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Recurring plan" error={errors.templateId?.message ?? errors.planId?.message} hint="Only plans available on the start date are listed">
              <Select {...register('planId')}>
                <option value="">Choose a plan…</option>
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {periodLabel(p.billingPeriod, p.billingInterval).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {template && (
            <ul className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
              {template.lines.map((l) => (
                <li key={l.id}>
                  {l.quantity} × {l.product.name}
                  {l.variant ? ` (${l.variant.name})` : ''}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" error={errors.startDate?.message}>
              <Input type="date" {...register('startDate')} />
            </Field>
            <Field label="Payment terms (days)" error={errors.paymentTermDays?.message} hint="Invoice due date = issue date + this">
              <Input type="number" min="0" max="365" {...register('paymentTermDays')} />
            </Field>
          </div>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              Create draft
            </Button>
          </div>
        </div>
      </Card>
      {addingCustomer && (
        <CustomerModal
          customer={null}
          onClose={() => setAddingCustomer(false)}
          onCreated={(c) => {
            setCustomerSearch(c.name)
            qc.invalidateQueries({ queryKey: ['customers', 'picker'] }).then(() => setValue('customerId', String(c.id), { shouldValidate: true }))
          }}
        />
      )}
    </form>
  )
}
