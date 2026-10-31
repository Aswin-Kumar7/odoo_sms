import { useState } from 'react'
import { clsx } from 'clsx'
import { Check, Pause } from 'lucide-react'
import { paymentMethodLabel, SUBSCRIPTION_FLOW, type ActivityEntry, type PaymentMethod, type SubscriptionStatus, type Totals } from '../api/types'
import { dateTime, humanize, money, percent } from '../lib/format'
import { Button, Field, Modal, Textarea } from './ui'

/** Draft → Quotation → Confirmed → Active → Closed, with Paused shown on the Active step. */
export function StatusStepper({ status }: { status: SubscriptionStatus }) {
  const current = SUBSCRIPTION_FLOW.indexOf(status === 'PAUSED' ? 'ACTIVE' : status)
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label="Lifecycle">
      {SUBSCRIPTION_FLOW.map((s, i) => {
        const done = i < current
        const active = i === current
        const paused = active && status === 'PAUSED'
        return (
          <li key={s} className="flex items-center" aria-current={active ? 'step' : undefined}>
            <span className={clsx('flex items-center gap-2 text-[13px]', active ? 'font-medium text-slate-900' : done ? 'text-slate-600' : 'text-slate-400')}>
              <span
                className={clsx(
                  'flex h-4 w-4 items-center justify-center rounded-full border',
                  paused ? 'border-amber-500 bg-amber-500 text-white' : active ? 'border-brand-600 bg-brand-600' : done ? 'border-line-strong bg-slate-100 text-slate-600' : 'border-line-strong',
                )}
              >
                {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                {paused && <Pause className="h-2 w-2" strokeWidth={3} />}
                {active && !paused && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
              </span>
              {paused ? 'Paused' : humanize(s)}
            </span>
            {i < SUBSCRIPTION_FLOW.length - 1 && <span className={clsx('mx-3 h-px w-6 sm:w-10', done ? 'bg-slate-400' : 'bg-line-strong')} />}
          </li>
        )
      })}
    </ol>
  )
}

const ACTION_TEXT: Record<string, string> = {
  created: 'Created',
  updated: 'Details updated',
  lines_updated: 'Lines updated',
  send_quote: 'Quotation sent',
  confirm: 'Confirmed',
  activate: 'Activated',
  pause: 'Paused',
  resume: 'Resumed',
  close: 'Closed',
  cancel: 'Cancelled',
  renew: 'Renewed',
  auto_activate: 'Activated automatically',
  auto_close: 'Closed automatically at expiry',
  discount_attached: 'Discount attached',
  discount_removed: 'Discount removed',
  send: 'Sent to customer',
  payment: 'Payment received',
}

function describeMeta(e: ActivityEntry): string | null {
  const m = e.meta ?? {}
  if (e.action === 'send_quote' && m.quoteExpiresAt) return `Valid until ${m.quoteExpiresAt}`
  if (e.action === 'renew' && m.newExpiry) return `Expiry ${m.previousExpiry} → ${m.newExpiry}`
  if ((e.action === 'close' || e.action === 'cancel') && m.reason) return String(m.reason)
  if (e.action === 'resume' && m.nextBillingDate) return `Next bill ${m.nextBillingDate}`
  if (e.action === 'lines_updated' && m.lineCount !== undefined) return `${m.lineCount} line(s)`
  if (e.action === 'updated' && Array.isArray(m.fields)) return `Changed: ${(m.fields as string[]).join(', ')}`
  if (e.action === 'send' && m.to) return `To ${m.to}`
  if (e.action === 'payment' && typeof m.amount === 'number') return `${money(m.amount)} · ${paymentMethodLabel(m.method as PaymentMethod)}${e.toStatus === 'PAID' ? ' · paid in full' : ''}`
  if (e.action === 'created' && m.billingRunId) return `Billing run #${m.billingRunId}`
  if (e.action === 'cancel' && m.rebill) return 'Period will be billed again on the next run'
  if (m.bulk) return 'Bulk confirmation'
  if (m.code) return String(m.code)
  return null
}

export function Timeline({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No activity yet</p>
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {entries.map((e) => {
        const detail = describeMeta(e)
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-slate-400" />
            <p className="text-sm font-medium text-slate-800">{ACTION_TEXT[e.action] ?? humanize(e.action)}</p>
            {detail && <p className="text-xs text-slate-600">{detail}</p>}
            <p className="text-xs text-slate-400">
              {dateTime(e.createdAt)} · {e.user ? `${e.user.name} (${e.user.role.toLowerCase()})` : 'System'}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** Priced lines and totals exactly as the pricing engine returned them. */
export function TotalsTable({ totals }: { totals: Totals }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-slate-500">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4 text-right">Qty</th>
            <th className="py-2 pr-4 text-right">Unit price</th>
            <th className="py-2 pr-4 text-right">Discount</th>
            <th className="py-2 pr-4 text-right">Tax</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {totals.lines.map((l) => (
            <tr key={l.key}>
              <td className="py-2 pr-4">{l.description}</td>
              <td className="py-2 pr-4 text-right">{l.quantity}</td>
              <td className="py-2 pr-4 text-right">{money(l.unitPrice)}</td>
              <td className="py-2 pr-4 text-right text-emerald-700">{l.discountAmount ? `−${money(l.discountAmount)}` : '—'}</td>
              <td className="py-2 pr-4 text-right text-slate-600">
                {money(l.taxAmount)} <span className="text-xs text-slate-400">{percent(l.taxRateBp)}</span>
              </td>
              <td className="py-2 text-right font-medium">{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd>{money(totals.subtotal)}</dd>
        </div>
        {totals.discountTotal > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>Discounts</dt>
            <dd>−{money(totals.discountTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-slate-500">Tax</dt>
          <dd>{money(totals.taxTotal)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-medium">
          <dt>Total per period</dt>
          <dd>{money(totals.total)}</dd>
        </div>
      </dl>
    </div>
  )
}

/** Confirms closing or cancelling a subscription, with an optional reason for the timeline. */
export function ReasonModal({ title, loading, onClose, onConfirm }: { title: string; loading: boolean; onClose: () => void; onConfirm: (reason: string | undefined) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={loading} onClick={() => onConfirm(reason.trim() || undefined)}>
            {title}
          </Button>
        </>
      }
    >
      <Field label="Reason (optional)" hint="Shown on the timeline">
        <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer moved to another provider" />
      </Field>
    </Modal>
  )
}
