import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import { PRODUCT_TYPES, type Product, type Tax } from '../../api/types'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { money, toMajor, toMinor } from '../../lib/format'

const amount = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative')

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a product name'),
  type: z.enum(['SERVICE', 'SOFTWARE_LICENSE', 'ADDON', 'GOODS']),
  salesPrice: amount,
  costPrice: amount,
  taxId: z.string(),
  notes: z.string().optional(),
  variants: z.array(
    z.object({
      id: z.number().optional(),
      attribute: z.string().trim().min(1, 'Required'),
      value: z.string().trim().min(1, 'Required'),
      priceExtra: amount,
    }),
  ),
})
type Form = z.infer<typeof schema>

const empty: Form = { name: '', type: 'SOFTWARE_LICENSE', salesPrice: 0, costPrice: 0, taxId: '', notes: '', variants: [] }

function toForm(p: Product): Form {
  return {
    name: p.name,
    type: p.type,
    salesPrice: toMajor(p.salesPrice),
    costPrice: toMajor(p.costPrice),
    taxId: p.taxId ? String(p.taxId) : '',
    notes: p.notes ?? '',
    variants: p.variants
      .filter((v) => v.isActive)
      .map((v) => {
        const [attribute, value] = Object.entries(v.attributes)[0] ?? v.name.split(': ')
        return { id: v.id, attribute: attribute ?? v.name, value: value ?? '', priceExtra: toMajor(v.priceExtra) }
      }),
  }
}

export function ProductFormPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const isAdmin = useIsAdmin()
  const readOnly = !isAdmin
  const navigate = useNavigate()
  const qc = useQueryClient()

  const product = useQuery({ queryKey: ['products', id], queryFn: () => api.get<Product>(`/products/${id}`), enabled: !isNew })
  const taxes = useQuery({ queryKey: ['taxes', 'active'], queryFn: () => api.get<{ data: Tax[] }>('/taxes').then((r) => r.data) })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: empty })
  const variants = useFieldArray({ control, name: 'variants' })

  // Reset once both the product and the tax options are loaded, so the tax <select> can show its value.
  useEffect(() => {
    if (product.data && taxes.data) reset(toForm(product.data))
  }, [product.data, taxes.data, reset])

  const onSubmit = handleSubmit(async (f) => {
    const body = {
      name: f.name,
      type: f.type,
      salesPrice: toMinor(f.salesPrice),
      costPrice: toMinor(f.costPrice),
      taxId: f.taxId ? Number(f.taxId) : null,
      notes: f.notes || null,
      variants: f.variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        name: `${v.attribute}: ${v.value}`,
        attributes: { [v.attribute]: v.value },
        priceExtra: toMinor(v.priceExtra),
      })),
    }
    try {
      const saved = isNew ? await api.post<Product>('/products', body) : await api.patch<Product>(`/products/${id}`, body)
      toast.success(isNew ? 'Product created' : 'Product saved')
      qc.invalidateQueries({ queryKey: ['products'] })
      if (isNew) navigate(`/products/${saved.id}`, { replace: true })
      else reset(toForm(saved))
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  const archive = async () => {
    if (!product.data || !confirm(`Archive "${product.data.name}"? Existing subscriptions keep using it.`)) return
    try {
      await api.del(`/products/${id}`)
      toast.success('Product archived')
      qc.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    } catch (err) {
      applyServerError(err)
    }
  }

  if ((!isNew && product.isPending) || taxes.isPending) return <Spinner />
  if (!isNew && product.isError) return <ErrorState error={product.error} onRetry={() => product.refetch()} />

  const sales = Number(watch('salesPrice')) || 0
  const cost = Number(watch('costPrice')) || 0

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>
      <PageHeader
        title={isNew ? 'New product' : product.data!.name}
        subtitle={!isNew && !product.data!.isActive ? <Badge status="CLOSED" label="Archived" /> : readOnly ? 'Read-only — only an admin can change products.' : undefined}
        actions={
          isAdmin && (
            <>
              {!isNew && product.data!.isActive && (
                <Button type="button" variant="secondary" onClick={archive}>
                  Archive
                </Button>
              )}
              <Button type="submit" loading={isSubmitting} disabled={!isNew && !isDirty}>
                {isNew ? 'Create product' : 'Save changes'}
              </Button>
            </>
          )
        }
      />

      <fieldset disabled={readOnly} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name?.message}>
              <Input autoFocus={isNew} {...register('name')} />
            </Field>
            <Field label="Type" error={errors.type?.message}>
              <Select {...register('type')}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sales price (₹)" error={errors.salesPrice?.message}>
              <Input type="number" step="0.01" min="0" {...register('salesPrice')} />
            </Field>
            <Field label="Cost price (₹)" error={errors.costPrice?.message} hint={sales > 0 ? `Margin ${Math.round(((sales - cost) / sales) * 100)}%` : undefined}>
              <Input type="number" step="0.01" min="0" {...register('costPrice')} />
            </Field>
            <Field label="Default tax" error={errors.taxId?.message} hint="Applied automatically when the product is added to a subscription">
              <Select {...register('taxId')}>
                <option value="">No tax</option>
                {taxes.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" error={errors.notes?.message}>
                <Textarea {...register('notes')} />
              </Field>
            </div>
          </div>
        </Card>

        <Card
          title="Variants"
          actions={
            !readOnly && (
              <Button type="button" variant="secondary" onClick={() => variants.append({ attribute: '', value: '', priceExtra: 0 })}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            )
          }
        >
          {variants.fields.length === 0 ? (
            <p className="text-sm text-slate-500">No variants. Add one for options such as brand or edition that change the price.</p>
          ) : (
            <div className="space-y-3">
              {variants.fields.map((field, i) => {
                const extra = Number(watch(`variants.${i}.priceExtra`)) || 0
                return (
                  <div key={field.id} className="rounded-md border border-line p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Attribute" error={errors.variants?.[i]?.attribute?.message}>
                        <Input placeholder="Brand" {...register(`variants.${i}.attribute`)} />
                      </Field>
                      <Field label="Value" error={errors.variants?.[i]?.value?.message}>
                        <Input placeholder="Odoo" {...register(`variants.${i}.value`)} />
                      </Field>
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <div className="flex-1">
                        <Field label="Price extra (₹)" error={errors.variants?.[i]?.priceExtra?.message}>
                          <Input type="number" step="0.01" min="0" {...register(`variants.${i}.priceExtra`)} />
                        </Field>
                      </div>
                      {!readOnly && (
                        <Button type="button" variant="ghost" onClick={() => variants.remove(i)} aria-label="Remove variant">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Unit price with this variant: {money(toMinor(sales + extra))}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </fieldset>
    </form>
  )
}
