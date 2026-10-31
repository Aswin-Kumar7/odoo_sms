import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '../../api/client'
import type { Discount, DiscountStatus } from '../../api/types'
import { useActiveProducts } from '../../api/lookups'
import { useIsAdmin } from '../../auth/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '../../components/ui'
import { applyServerError } from '../../lib/forms'
import { toMajor, toMinor } from '../../lib/format'
import { discountConditions, discountUsage, discountValue } from '../../lib/discounts'

const STATUS_BADGE: Record<DiscountStatus, { status: string; label: string }> = {
  ACTIVE: { status: 'ACTIVE', label: 'Active' },
  SCHEDULED: { status: 'QUOTATION', label: 'Scheduled' },
  EXPIRED: { status: 'CLOSED', label: 'Expired' },
  USED_UP: { status: 'PAUSED', label: 'Used up' },
  INACTIVE: { status: 'CLOSED', label: 'Inactive' },
}

export function DiscountsPage() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Discount | 'new' | null>(null)

  const list = useQuery({ queryKey: ['discounts'], queryFn: () => api.get<{ data: Discount[] }>('/discounts').then((r) => r.data) })

  const toggle = useMutation({
    mutationFn: (d: Discount) => api.patch(`/discounts/${d.id}`, { isActive: !d.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
    onError: (e) => applyServerError(e),
  })

  return (
    <>
      <PageHeader
        title="Discounts"
        subtitle="Once attached to a subscription, a discount appears on every invoice automatically and stops when it expires or its usage limit is reached"
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New discount
            </Button>
          )
        }
      />
      <Card>
        <div className="-m-5">
          {list.isPending ? (
            <Spinner />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data!.length === 0 ? (
            <EmptyState title="No discounts yet" description={isAdmin ? 'Create a rule such as 10% off for 5 or more seats.' : undefined} />
          ) : (
            <Table headers={['Code', 'Discount', 'Applies to', 'Used', 'Subscriptions', 'Status', '']}>
              {list.data!.map((d) => (
                <tr key={d.id}>
                  <Td className="font-mono text-xs font-medium text-slate-800">{d.code}</Td>
                  <Td>
                    <span className="font-medium text-slate-900">{discountValue(d)}</span>
                    <span className="block text-xs text-slate-500">{d.name}</span>
                  </Td>
                  <Td className="whitespace-normal text-xs text-slate-600">{discountConditions(d)}</Td>
                  <Td>{discountUsage(d)}</Td>
                  <Td>{d._count?.subscriptions ?? 0}</Td>
                  <Td>{d.status && <Badge {...STATUS_BADGE[d.status]} />}</Td>
                  <Td className="text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setEditing(d)}>
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => toggle.mutate(d)} disabled={toggle.isPending}>
                          {d.isActive ? 'Deactivate' : 'Activate'}
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
      {editing && <DiscountModal discount={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

const optionalNumber = (msg: string) => z.string().refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), msg)

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name'),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{3,30}$/, '3–30 letters, digits or dashes'),
    kind: z.enum(['PERCENT', 'FIXED']),
    value: z.coerce.number({ invalid_type_error: 'Enter a value' }).positive('Must be more than 0'),
    scope: z.enum(['PRODUCT', 'SUBSCRIPTION']),
    productId: z.string(),
    minPurchase: optionalNumber('Enter an amount'),
    minQuantity: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1), 'Whole number ≥ 1'),
    startsOn: z.string(),
    endsOn: z.string(),
    usageLimit: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1), 'Whole number ≥ 1'),
  })
  .refine((v) => v.kind !== 'PERCENT' || v.value <= 100, { path: ['value'], message: 'At most 100%' })
  .refine((v) => v.scope !== 'PRODUCT' || v.productId, { path: ['productId'], message: 'Choose a product' })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'Must be on or after the start date' })
type Form = z.infer<typeof schema>

const str = (n: number | null | undefined) => (n == null ? '' : String(n))

function DiscountModal({ discount, onClose }: { discount: Discount | null; onClose: () => void }) {
  const qc = useQueryClient()
  const products = useActiveProducts()
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: discount
      ? {
          name: discount.name,
          code: discount.code,
          kind: discount.kind,
          value: discount.kind === 'PERCENT' ? discount.value / 100 : toMajor(discount.value),
          scope: discount.scope,
          productId: str(discount.productId),
          minPurchase: discount.minPurchase == null ? '' : String(toMajor(discount.minPurchase)),
          minQuantity: str(discount.minQuantity),
          startsOn: discount.startsOn?.slice(0, 10) ?? '',
          endsOn: discount.endsOn?.slice(0, 10) ?? '',
          usageLimit: str(discount.usageLimit),
        }
      : { name: '', code: '', kind: 'PERCENT', value: 10, scope: 'SUBSCRIPTION', productId: '', minPurchase: '', minQuantity: '', startsOn: '', endsOn: '', usageLimit: '' },
  })
  const kind = watch('kind')
  const scope = watch('scope')

  // Re-apply the selected product once its <option> exists.
  useEffect(() => {
    if (products.data) setValue('productId', getValues('productId'))
  }, [products.data, setValue, getValues])

  const onSubmit = handleSubmit(async (f) => {
    const body = {
      name: f.name,
      code: f.code,
      kind: f.kind,
      value: f.kind === 'PERCENT' ? Math.round(f.value * 100) : toMinor(f.value),
      scope: f.scope,
      productId: f.scope === 'PRODUCT' ? Number(f.productId) : null,
      minPurchase: f.minPurchase === '' ? null : toMinor(Number(f.minPurchase)),
      minQuantity: f.minQuantity === '' ? null : Number(f.minQuantity),
      startsOn: f.startsOn || null,
      endsOn: f.endsOn || null,
      usageLimit: f.usageLimit === '' ? null : Number(f.usageLimit),
    }
    try {
      if (discount) await api.patch(`/discounts/${discount.id}`, body)
      else await api.post('/discounts', body)
      toast.success(discount ? 'Discount updated' : 'Discount created')
      qc.invalidateQueries({ queryKey: ['discounts'] })
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      onClose()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open
      title={discount ? `Edit ${discount.code}` : 'New discount rule'}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" error={errors.code?.message} hint="Upper-cased automatically">
            <Input autoFocus placeholder="SEATS10" className="" {...register('code')} />
          </Field>
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="10% for 5+ seats" {...register('name')} />
          </Field>
          <Field label="Type" error={errors.kind?.message}>
            <Select {...register('kind')}>
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </Select>
          </Field>
          <Field label={kind === 'PERCENT' ? 'Percent off' : 'Amount off (₹)'} error={errors.value?.message}>
            <Input type="number" step="0.01" min="0" {...register('value')} />
          </Field>
          <Field label="Applies to" error={errors.scope?.message}>
            <Select {...register('scope')}>
              <option value="SUBSCRIPTION">Whole subscription</option>
              <option value="PRODUCT">A specific product</option>
            </Select>
          </Field>
          {scope === 'PRODUCT' ? (
            <Field label="Product" error={errors.productId?.message}>
              <Select {...register('productId')}>
                <option value="">Choose…</option>
                {products.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div />
          )}
          <Field label="Minimum purchase (₹)" error={errors.minPurchase?.message} hint={scope === 'PRODUCT' ? 'Line amount' : 'Subtotal after product discounts'}>
            <Input type="number" step="0.01" min="0" placeholder="None" {...register('minPurchase')} />
          </Field>
          <Field label="Minimum quantity" error={errors.minQuantity?.message} hint={scope === 'PRODUCT' ? 'Units on the line' : 'Units across all lines'}>
            <Input type="number" min="1" placeholder="None" {...register('minQuantity')} />
          </Field>
          <Field label="Starts on" error={errors.startsOn?.message}>
            <Input type="date" {...register('startsOn')} />
          </Field>
          <Field label="Ends on" error={errors.endsOn?.message}>
            <Input type="date" {...register('endsOn')} />
          </Field>
          <Field label="Usage limit" error={errors.usageLimit?.message} hint={discount ? `Used ${discount.usageCount} times so far` : 'Number of invoices it can appear on'}>
            <Input type="number" min="1" placeholder="Unlimited" {...register('usageLimit')} />
          </Field>
        </div>
        {kind === 'FIXED' && scope === 'PRODUCT' && <p className="text-xs text-slate-500">A fixed product discount comes off each matching line once (not per unit).</p>}
      </form>
    </Modal>
  )
}
