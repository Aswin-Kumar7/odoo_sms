import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { QuotationTemplate } from '../../api/types'
import { periodLabel } from '../../api/types'
import { useActivePlans, useActiveProducts } from '../../api/lookups'
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { money } from '../../lib/format'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  planId: z.string().min(1, 'Choose a plan'),
  validityDays: z.coerce.number().int().min(1, 'At least 1 day').max(365),
  notes: z.string().optional(),
  lines: z.array(z.object({ productId: z.string().min(1, 'Choose a product'), variantId: z.string(), quantity: z.coerce.number().int().min(1, 'At least 1') })),
})
type Form = z.infer<typeof schema>

export function TemplateFormPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const products = useActiveProducts()
  const plans = useActivePlans()
  const template = useQuery({ queryKey: ['templates', id], queryFn: () => api.get<QuotationTemplate>(`/templates/${id}`), enabled: !isNew })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', planId: '', validityDays: 30, notes: '', lines: [] } })
  const lines = useFieldArray({ control, name: 'lines' })

  // Reset once the template and the picker options are all loaded, so every <select> can show its value.
  useEffect(() => {
    const t = template.data
    if (t && products.data && plans.data) {
      reset({
        name: t.name,
        planId: String(t.planId),
        validityDays: t.validityDays,
        notes: t.notes ?? '',
        lines: t.lines.map((l) => ({ productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : '', quantity: l.quantity })),
      })
    }
  }, [template.data, products.data, plans.data, reset])

  const onSubmit = handleSubmit(async (f) => {
    const body = {
      name: f.name,
      planId: Number(f.planId),
      validityDays: f.validityDays,
      notes: f.notes || null,
      lines: f.lines.map((l) => ({ productId: Number(l.productId), variantId: l.variantId ? Number(l.variantId) : null, quantity: l.quantity })),
    }
    try {
      if (isNew) await api.post('/templates', body)
      else await api.put(`/templates/${id}`, body)
      toast.success(isNew ? 'Template created' : 'Template saved')
      qc.invalidateQueries({ queryKey: ['templates'] })
      navigate('/templates')
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  if ((!isNew && template.isPending) || products.isPending || plans.isPending) return <Spinner />
  if (!isNew && template.isError) return <ErrorState error={template.error} />

  const plan = plans.data?.find((p) => String(p.id) === watch('planId'))
  const productById = new Map(products.data?.map((p) => [String(p.id), p]))
  const linesValue = watch('lines').reduce((sum, l) => {
    const p = productById.get(l.productId)
    const extra = p?.variants.find((v) => String(v.id) === l.variantId)?.priceExtra ?? 0
    return sum + (Number(l.quantity) || 0) * ((p?.salesPrice ?? 0) + extra)
  }, plan?.price ?? 0)

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link to="/templates" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Templates
      </Link>
      <PageHeader
        title={isNew ? 'New quotation template' : template.data!.name}
        actions={
          <Button type="submit" loading={isSubmitting}>
            {isNew ? 'Create template' : 'Save template'}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Template" className="lg:col-span-1">
          <div className="space-y-4">
            <Field label="Name" error={errors.name?.message}>
              <Input autoFocus={isNew} placeholder="SMB Starter" {...register('name')} />
            </Field>
            <Field label="Recurring plan" error={errors.planId?.message}>
              <Select {...register('planId')}>
                <option value="">Choose a plan…</option>
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {periodLabel(p.billingPeriod, p.billingInterval).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quote valid for (days)" error={errors.validityDays?.message}>
              <Input type="number" min="1" max="365" {...register('validityDays')} />
            </Field>
            <Field label="Notes" error={errors.notes?.message}>
              <Textarea {...register('notes')} />
            </Field>
            <p className="text-sm text-slate-600">
              Per period before tax: <span className="font-semibold">{money(linesValue)}</span>
              {plan && plan.minQuantity > 1 && <span className="block text-xs text-amber-700">This plan needs at least {plan.minQuantity} per line.</span>}
            </p>
          </div>
        </Card>
        <Card
          title="Product lines"
          className="lg:col-span-2"
          actions={
            <Button type="button" variant="secondary" onClick={() => lines.append({ productId: '', variantId: '', quantity: plan?.minQuantity ?? 1 })}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          }
        >
          {lines.fields.length === 0 ? (
            <p className="text-sm text-slate-500">No lines yet. Add the products this offer includes.</p>
          ) : (
            <div className="space-y-3">
              {lines.fields.map((field, i) => {
                const product = productById.get(watch(`lines.${i}.productId`))
                return (
                  <div key={field.id} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-12 sm:col-span-5">
                      <Field label="Product" error={errors.lines?.[i]?.productId?.message}>
                        <Select {...register(`lines.${i}.productId`, { onChange: () => setValue(`lines.${i}.variantId`, '') })}>
                          <option value="">Choose…</option>
                          {products.data?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="col-span-7 sm:col-span-4">
                      <Field label="Variant">
                        <Select {...register(`lines.${i}.variantId`)} disabled={!product?.variants.length}>
                          <option value="">{product?.variants.length ? 'No variant' : '—'}</option>
                          {product?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} (+{money(v.priceExtra)})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <Field label="Qty" error={errors.lines?.[i]?.quantity?.message}>
                        <Input type="number" min="1" {...register(`lines.${i}.quantity`)} />
                      </Field>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Button type="button" variant="ghost" onClick={() => lines.remove(i)} aria-label="Remove line">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </form>
  )
}
