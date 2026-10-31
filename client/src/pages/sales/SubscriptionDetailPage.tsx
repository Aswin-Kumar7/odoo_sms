import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../api/client'
import { periodLabel, type Discount, type Product, type Subscription, type SubscriptionAction, type Tax, type Totals } from '../../api/types'
import { useActivePlans, useActiveProducts, useActiveTaxes } from '../../api/lookups'
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '../../components/ui'
import { ReasonModal, StatusStepper, Timeline, TotalsTable } from '../../components/subscription'
import { applyServerError } from '../../lib/forms'
import { date, money, todayIso, toMajor, toMinor } from '../../lib/format'
import { discountConditions, discountValue } from '../../lib/discounts'
import { InvoiceStatusBadge, lastDay } from '../../components/invoice'

const NEEDS_REASON: SubscriptionAction[] = ['close', 'cancel']
const DANGER: SubscriptionAction[] = ['close', 'cancel']

export function SubscriptionDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const key = ['subscriptions', id]
  const sub = useQuery({ queryKey: key, queryFn: () => api.get<Subscription>(`/subscriptions/${id}`) })
  const [reasonFor, setReasonFor] = useState<SubscriptionAction | null>(null)
  const [editingInfo, setEditingInfo] = useState(false)
  // Lifecycle actions wait while lines are being edited or saved, so a quotation never goes out with stale lines.
  const [linesState, setLinesState] = useState<{ dirty: boolean; saving: boolean }>({ dirty: false, saving: false })
  const linesBusy = linesState.dirty || linesState.saving

  const setDetail = (s: Subscription) => {
    qc.setQueryData(key, s)
    qc.invalidateQueries({ queryKey: ['subscriptions'], exact: false, refetchType: 'none' })
  }

  const act = useMutation({
    mutationFn: ({ action, reason }: { action: SubscriptionAction; reason?: string }) =>
      api.post<Subscription>(`/subscriptions/${id}/${action}`, { version: sub.data!.version, reason }),
    onSuccess: (s, v) => {
      setDetail(s)
      toast.success(`${sub.data?.actions.find((a) => a.action === v.action)?.label ?? 'Done'} — now ${s.status.toLowerCase()}`)
      setReasonFor(null)
    },
    onError: (e) => {
      applyServerError(e)
      if (e instanceof ApiError && e.code === 'STALE_STATE') sub.refetch()
    },
  })

  if (sub.isPending) return <Spinner />
  if (sub.isError) return <ErrorState error={sub.error} onRetry={() => sub.refetch()} />
  const s = sub.data!

  return (
    <>
      <Link to="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Subscriptions
      </Link>
      <PageHeader
        title={s.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {s.customer.name} · {s.plan.name} <Badge status={s.status} />
          </span>
        }
        actions={s.actions.map((a) => (
          <Button
            key={a.action}
            variant={DANGER.includes(a.action) ? 'secondary' : 'primary'}
            disabled={!!a.blockedReason || act.isPending || linesBusy}
            title={a.blockedReason ?? undefined}
            loading={act.isPending && act.variables?.action === a.action}
            onClick={() => (NEEDS_REASON.includes(a.action) ? setReasonFor(a.action) : act.mutate({ action: a.action }))}
          >
            {a.label}
          </Button>
        ))}
      />
      <div className="mb-6 space-y-2">
        <StatusStepper status={s.status} />
        {linesBusy && <p className="text-xs text-amber-700">{linesState.saving ? 'Saving lines…' : 'Save or undo your line changes before changing the status.'}</p>}
        {s.actions.filter((a) => a.blockedReason).map((a) => (
          <p key={a.action} className="text-xs text-amber-700">
            {a.label}: {a.blockedReason}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {s.editable ? <LinesEditor sub={s} onSaved={setDetail} onStateChange={setLinesState} /> : <Card title="Lines">{<TotalsTable totals={s.totals} />}</Card>}
          {s.editable && (
            <Card title="Totals">
              <TotalsTable totals={s.totals} />
            </Card>
          )}
          <Card title="Invoices">
            {s.invoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices yet. They are generated from this subscription on each billing date once it is active.</p>
            ) : (
              <div className="-m-5">
                <Table headers={['Invoice', 'Period', 'Status', 'Due', 'Total', 'Paid']}>
                  {s.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <Td className="font-medium">
                        <Link to={`/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                          {inv.number}
                        </Link>
                      </Td>
                      <Td>
                        {date(inv.periodStart)} – {date(lastDay(inv.periodEnd))}
                      </Td>
                      <Td>
                        <InvoiceStatusBadge status={inv.status} overdue={inv.status === 'CONFIRMED' && inv.dueDate.slice(0, 10) < todayIso()} />
                      </Td>
                      <Td>{date(inv.dueDate)}</Td>
                      <Td>{money(inv.total)}</Td>
                      <Td>{money(inv.amountPaid)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Details"
            actions={
              s.editable && (
                <Button variant="ghost" onClick={() => setEditingInfo(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )
            }
          >
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Customer</dt>
              <dd>
                {s.customer.name}
                <span className="block text-xs text-slate-500">{s.customer.email}</span>
              </dd>
              <dt className="text-slate-500">Plan</dt>
              <dd>
                {s.plan.name}
                <span className="block text-xs text-slate-500">{periodLabel(s.plan.billingPeriod, s.plan.billingInterval)}</span>
              </dd>
              {s.template && (
                <>
                  <dt className="text-slate-500">Template</dt>
                  <dd>{s.template.name}</dd>
                </>
              )}
              <dt className="text-slate-500">Start date</dt>
              <dd>{date(s.startDate)}</dd>
              <dt className="text-slate-500">Expiry date</dt>
              <dd>{s.expiryDate ? date(s.expiryDate) : s.plan.termLength ? 'Set on activation' : 'Open-ended'}</dd>
              {s.status === 'ACTIVE' && (
                <>
                  <dt className="text-slate-500">Next billing</dt>
                  <dd className="font-medium">{date(s.nextBillingDate)}</dd>
                </>
              )}
              <dt className="text-slate-500">Payment terms</dt>
              <dd>{s.paymentTermDays === 0 ? 'Due on issue' : `Net ${s.paymentTermDays} days`}</dd>
              {s.quoteExpiresAt && (
                <>
                  <dt className="text-slate-500">Quote valid until</dt>
                  <dd>{date(s.quoteExpiresAt)}</dd>
                </>
              )}
              {s.closeReason && (
                <>
                  <dt className="text-slate-500">Closed</dt>
                  <dd>{s.closeReason}</dd>
                </>
              )}
              <dt className="text-slate-500">Plan rules</dt>
              <dd className="text-xs text-slate-600">
                {[s.plan.pausable && 'pausable', s.plan.closable && 'closable', s.plan.renewable && 'renewable', s.plan.autoClose && 'auto-closes'].filter(Boolean).join(', ') || 'none'}
              </dd>
            </dl>
            {s.notes && <p className="mt-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-600">{s.notes}</p>}
          </Card>
          <DiscountsPanel sub={s} onSaved={setDetail} />
          <Card title="Timeline">
            <Timeline entries={s.timeline} />
          </Card>
        </div>
      </div>

      {reasonFor && (
        <ReasonModal
          title={reasonFor === 'cancel' ? 'Cancel subscription' : 'Close subscription'}
          loading={act.isPending}
          onClose={() => setReasonFor(null)}
          onConfirm={(reason) => act.mutate({ action: reasonFor, reason })}
        />
      )}
      {editingInfo && <InfoModal sub={s} onClose={() => setEditingInfo(false)} onSaved={setDetail} />}
    </>
  )
}

// ───────────────────────── Details editing ─────────────────────────

const infoSchema = z
  .object({
    planId: z.string().min(1),
    startDate: z.string().min(1, 'Required'),
    expiryDate: z.string(),
    paymentTermDays: z.coerce.number().int().min(0).max(365),
    notes: z.string().optional(),
  })
  .refine((v) => !v.expiryDate || v.expiryDate > v.startDate, { path: ['expiryDate'], message: 'Must be after the start date' })
type InfoForm = z.infer<typeof infoSchema>

function InfoModal({ sub, onClose, onSaved }: { sub: Subscription; onClose: () => void; onSaved: (s: Subscription) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<InfoForm>({
    resolver: zodResolver(infoSchema),
    defaultValues: {
      planId: String(sub.planId),
      startDate: sub.startDate.slice(0, 10),
      expiryDate: sub.expiryDate?.slice(0, 10) ?? '',
      paymentTermDays: sub.paymentTermDays,
      notes: sub.notes ?? '',
    },
  })
  const plans = useActivePlans(watch('startDate') || undefined)
  // Keep the current plan selectable even if it is not sellable on a newly picked date.
  const planOptions = plans.data && !plans.data.some((p) => p.id === sub.planId) ? [sub.plan, ...plans.data] : plans.data
  // Re-apply the selected value once its <option> exists.
  useEffect(() => {
    if (planOptions) setValue('planId', getValues('planId'))
  }, [planOptions, setValue, getValues])

  const onSubmit = handleSubmit(async (f) => {
    try {
      const s = await api.patch<Subscription>(`/subscriptions/${sub.id}`, {
        version: sub.version,
        planId: Number(f.planId),
        startDate: f.startDate,
        expiryDate: f.expiryDate || null,
        paymentTermDays: f.paymentTermDays,
        notes: f.notes || null,
      })
      onSaved(s)
      toast.success('Details saved')
      onClose()
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Modal
      open
      title="Edit details"
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
        <Field label="Plan" error={errors.planId?.message} hint="Only plans available on the start date">
          <Select {...register('planId')} disabled={!planOptions}>
            {planOptions?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {periodLabel(p.billingPeriod, p.billingInterval).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" error={errors.startDate?.message}>
            <Input type="date" {...register('startDate')} />
          </Field>
          <Field label="Expiry date" error={errors.expiryDate?.message} hint="Blank = from plan term">
            <Input type="date" {...register('expiryDate')} />
          </Field>
        </div>
        <Field label="Payment terms (days)" error={errors.paymentTermDays?.message}>
          <Input type="number" min="0" max="365" {...register('paymentTermDays')} />
        </Field>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea {...register('notes')} />
        </Field>
      </form>
    </Modal>
  )
}

// ───────────────────────── Lines editing ─────────────────────────

const linesSchema = z.object({
  lines: z.array(
    z.object({
      productId: z.string().min(1, 'Choose a product'),
      variantId: z.string(),
      quantity: z.coerce.number().int().min(1, 'At least 1'),
      unitPrice: z.coerce.number().min(0, 'Cannot be negative'),
      taxId: z.string(),
    }),
  ),
})
type LinesForm = z.infer<typeof linesSchema>

// A <select> can only show a value once its <option> exists, so the form mounts after the look-ups load.
type LinesState = { dirty: boolean; saving: boolean }

function LinesEditor({ sub, onSaved, onStateChange }: { sub: Subscription; onSaved: (s: Subscription) => void; onStateChange: (s: LinesState) => void }) {
  const products = useActiveProducts()
  const taxes = useActiveTaxes()
  if (!products.data || !taxes.data) {
    return (
      <Card title="Lines">
        {products.isError || taxes.isError ? <ErrorState error={products.error ?? taxes.error} /> : <Spinner label="Loading catalogue" />}
      </Card>
    )
  }
  return <LinesForm sub={sub} onSaved={onSaved} onStateChange={onStateChange} products={products.data} taxes={taxes.data} />
}

function LinesForm({
  sub,
  onSaved,
  onStateChange,
  products,
  taxes,
}: {
  sub: Subscription
  onSaved: (s: Subscription) => void
  onStateChange: (s: LinesState) => void
  products: Product[]
  taxes: Tax[]
}) {
  const toForm = (s: Subscription): LinesForm => ({
    lines: s.lines.map((l) => ({
      productId: String(l.productId),
      variantId: l.variantId ? String(l.variantId) : '',
      quantity: l.quantity,
      unitPrice: toMajor(l.unitPrice),
      taxId: l.taxId ? String(l.taxId) : '',
    })),
  })
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<LinesForm>({ resolver: zodResolver(linesSchema), defaultValues: toForm(sub) })
  const lines = useFieldArray({ control, name: 'lines' })

  // Live totals for unsaved edits, from the same engine the server uses for invoices.
  const watched = useDeferredValue(JSON.stringify(watch('lines')))
  const previewBody = (() => {
    const ls = (JSON.parse(watched) as LinesForm['lines']).filter((l) => l.productId && Number(l.quantity) >= 1)
    return {
      planId: sub.planId,
      asOf: sub.pricedOn.slice(0, 10),
      discountIds: sub.discounts.map((d) => d.discountId),
      lines: ls.map((l) => ({
        productId: Number(l.productId),
        variantId: l.variantId ? Number(l.variantId) : null,
        quantity: Number(l.quantity),
        unitPrice: toMinor(Number(l.unitPrice) || 0),
        taxId: l.taxId ? Number(l.taxId) : null,
      })),
    }
  })()
  const preview = useQuery({
    queryKey: ['pricing-preview', previewBody],
    queryFn: () => api.post<Totals>('/pricing/preview', previewBody),
    enabled: isDirty,
    retry: false,
    staleTime: 30_000,
  })

  useEffect(() => reset(toForm(sub)), [sub.version]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onStateChange({ dirty: isDirty, saving: isSubmitting }), [isDirty, isSubmitting, onStateChange])
  useEffect(() => () => onStateChange({ dirty: false, saving: false }), [onStateChange])

  const productById = new Map(products.map((p) => [String(p.id), p]))

  // Picking a product or variant fills in its catalogue price and default tax; both stay editable.
  const applyDefaults = (i: number) => {
    const p = productById.get(getValues(`lines.${i}.productId`))
    if (!p) return
    const extra = p.variants.find((v) => String(v.id) === getValues(`lines.${i}.variantId`))?.priceExtra ?? 0
    setValue(`lines.${i}.unitPrice`, toMajor(p.salesPrice + extra), { shouldDirty: true })
    setValue(`lines.${i}.taxId`, p.taxId ? String(p.taxId) : '', { shouldDirty: true })
  }

  const onSubmit = handleSubmit(async (f) => {
    try {
      const s = await api.put<Subscription>(`/subscriptions/${sub.id}/lines`, {
        version: sub.version,
        lines: f.lines.map((l) => ({
          productId: Number(l.productId),
          variantId: l.variantId ? Number(l.variantId) : null,
          quantity: l.quantity,
          unitPrice: toMinor(l.unitPrice),
          taxId: l.taxId ? Number(l.taxId) : null,
        })),
      })
      onSaved(s)
      toast.success('Lines saved')
    } catch (err) {
      applyServerError(err, setError)
    }
  })

  return (
    <Card
      title="Lines"
      actions={
        <>
          <Button type="button" variant="secondary" onClick={() => lines.append({ productId: '', variantId: '', quantity: sub.plan.minQuantity, unitPrice: 0, taxId: '' })}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
          {isDirty && !isSubmitting && (
            <Button type="button" variant="ghost" onClick={() => reset(toForm(sub))}>
              Undo
            </Button>
          )}
          <Button type="button" onClick={onSubmit} loading={isSubmitting} disabled={!isDirty}>
            Save lines
          </Button>
        </>
      }
    >
      {sub.plan.price > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          Plus the {sub.plan.name} plan fee of {money(sub.plan.price)} per period{sub.plan.tax ? ` (${sub.plan.tax.name})` : ''}.
        </p>
      )}
      {sub.plan.minQuantity > 1 && <p className="mb-3 text-xs text-amber-700">The {sub.plan.name} plan needs a quantity of at least {sub.plan.minQuantity} on every line.</p>}
      {lines.fields.length === 0 ? (
        <p className="text-sm text-slate-500">No lines yet.</p>
      ) : (
        // Laid out by the card's own width (container query): the editor lives in a narrow column.
        <div className="@container space-y-3">
          {lines.fields.map((field, i) => {
            const product = productById.get(watch(`lines.${i}.productId`))
            const amount = (Number(watch(`lines.${i}.quantity`)) || 0) * (Number(watch(`lines.${i}.unitPrice`)) || 0)
            return (
              <div key={field.id} className="grid grid-cols-6 items-end gap-3 border-b border-line pb-4 last:border-0 last:pb-0 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_76px_104px_minmax(0,1fr)_auto]">
                <div className="col-span-6 @md:col-span-3 @4xl:col-span-1">
                  <Field label="Product" error={errors.lines?.[i]?.productId?.message}>
                    <Select
                      {...register(`lines.${i}.productId`, {
                        onChange: () => {
                          setValue(`lines.${i}.variantId`, '')
                          applyDefaults(i)
                        },
                      })}
                    >
                      <option value="">Choose…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-6 @md:col-span-3 @4xl:col-span-1">
                  <Field label="Variant">
                    <Select {...register(`lines.${i}.variantId`, { onChange: () => applyDefaults(i) })} disabled={!product?.variants.length}>
                      <option value="">{product?.variants.length ? 'No variant' : '—'}</option>
                      {product?.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (+{money(v.priceExtra)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-2 @4xl:col-span-1">
                  <Field label="Qty" error={errors.lines?.[i]?.quantity?.message}>
                    <Input type="number" min="1" {...register(`lines.${i}.quantity`)} />
                  </Field>
                </div>
                <div className="col-span-2 @4xl:col-span-1">
                  <Field label="Unit ₹" error={errors.lines?.[i]?.unitPrice?.message}>
                    <Input type="number" step="0.01" min="0" {...register(`lines.${i}.unitPrice`)} />
                  </Field>
                </div>
                <div className="col-span-2 @4xl:col-span-1">
                  <Field label="Tax">
                    <Select {...register(`lines.${i}.taxId`)}>
                      <option value="">None</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="col-span-6 flex h-9 items-center justify-between gap-2 @4xl:col-span-1 @4xl:justify-end">
                  <span className="font-mono text-[13px] text-slate-700">{money(toMinor(amount))}</span>
                  <Button type="button" variant="ghost" onClick={() => lines.remove(i)} aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {isDirty && (
        <div className="mt-4 rounded-md border border-dashed border-brand-500/40 bg-brand-50/40 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-brand-700">Preview — not saved yet</p>
          {preview.isError ? (
            <p className="text-xs text-red-600">{(preview.error as Error).message}</p>
          ) : preview.data ? (
            <p className="text-slate-700">
              Subtotal {money(preview.data.subtotal)}
              {preview.data.discountTotal > 0 && <span className="text-emerald-700"> − discounts {money(preview.data.discountTotal)}</span>} + tax {money(preview.data.taxTotal)} ={' '}
              <span className="font-medium">{money(preview.data.total)}</span> per period
            </p>
          ) : (
            <p className="text-xs text-slate-500">Calculating…</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ───────────────────────── Discounts ─────────────────────────

function DiscountsPanel({ sub, onSaved }: { sub: Subscription; onSaved: (s: Subscription) => void }) {
  const [adding, setAdding] = useState('')
  const all = useQuery({ queryKey: ['discounts'], queryFn: () => api.get<{ data: Discount[] }>('/discounts').then((r) => r.data), staleTime: 30_000 })
  const attachedIds = new Set(sub.discounts.map((d) => d.discountId))
  const available = all.data?.filter((d) => d.status === 'ACTIVE' && !attachedIds.has(d.id)) ?? []
  const outcome = new Map(sub.totals.discounts?.map((o) => [o.discountId, o]))
  const closed = sub.status === 'CLOSED'

  const attach = useMutation({
    mutationFn: (discountId: number) => api.post<Subscription>(`/subscriptions/${sub.id}/discounts`, { discountId }),
    onSuccess: (s) => {
      onSaved(s)
      setAdding('')
      toast.success('Discount added — it will appear on the next invoice')
    },
    onError: (e) => applyServerError(e),
  })
  const detach = useMutation({
    mutationFn: (discountId: number) => api.del<Subscription>(`/subscriptions/${sub.id}/discounts/${discountId}`),
    onSuccess: (s) => {
      onSaved(s)
      toast.success('Discount removed')
    },
    onError: (e) => applyServerError(e),
  })

  return (
    <Card title="Discounts">
      {sub.discounts.length === 0 ? (
        <p className="text-sm text-slate-500">No discounts on this subscription.</p>
      ) : (
        <ul className="space-y-2">
          {sub.discounts.map(({ discount: d }) => {
            const o = outcome.get(d.id)
            return (
              <li key={d.id} className="flex items-start justify-between gap-2 rounded-md border border-line p-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Tag className="h-3.5 w-3.5 text-brand-600" /> <span className="font-mono text-xs">{d.code}</span> {discountValue(d)}
                  </p>
                  <p className="text-xs text-slate-500">{discountConditions(d)}</p>
                  {o && (o.reason ? <p className="text-xs text-amber-700">Not applied: {o.reason}</p> : <p className="text-xs text-emerald-700">Saves {money(o.amount)} on the next invoice</p>)}
                </div>
                {!closed && (
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={`Remove ${d.code}`} onClick={() => detach.mutate(d.id)} disabled={detach.isPending}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!closed && (
        <div className="mt-3 flex gap-2">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)} disabled={!available.length}>
            <option value="">{available.length ? 'Add a discount…' : 'No other active discounts'}</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {discountValue(d)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" disabled={!adding} loading={attach.isPending} onClick={() => attach.mutate(Number(adding))}>
            Add
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">Judged on {date(sub.pricedOn)}, the date of the next invoice.</p>
    </Card>
  )
}
