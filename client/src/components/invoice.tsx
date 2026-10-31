import type { Invoice } from '../api/types'
import { paymentMethodLabel, periodLabel } from '../api/types'
import { date, money, percent } from '../lib/format'
import { Badge } from './ui'
import { LogoMark } from './brand'

/** The period end is stored exclusive (= next period's start); people expect the last day. */
export const lastDay = (iso: string) => new Date(new Date(iso).getTime() - 86_400_000).toISOString()

export function InvoiceStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return overdue ? <Badge status="OVERDUE" label="Overdue" /> : <Badge status={status} />
}

/**
 * The invoice as a document — used on screen and for printing (the surrounding page
 * hides everything marked no-print). Shared by staff and the customer portal.
 */
export function InvoiceDocument({ inv }: { inv: Omit<Invoice, 'timeline' | 'billingRun'> }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
            <span className="text-lg font-medium text-slate-900">Brightloop Software</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Subscription billing · billing@brightloop.test</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Tax invoice</p>
          <p className="text-xl font-medium text-slate-900">{inv.number}</p>
          <div className="mt-1">
            <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 border-b border-line py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Billed to</p>
          <p className="font-medium text-slate-900">{inv.customer.name}</p>
          <p className="text-slate-600">{inv.customer.email}</p>
          {inv.customer.address && <p className="whitespace-pre-line text-slate-600">{inv.customer.address}</p>}
          {inv.customer.taxId && <p className="text-slate-600">GSTIN {inv.customer.taxId}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:text-right">
          <dt className="text-slate-500">Issue date</dt>
          <dd>{date(inv.issueDate)}</dd>
          <dt className="text-slate-500">Due date</dt>
          <dd className={inv.overdue ? 'font-medium text-red-600' : ''}>{date(inv.dueDate)}</dd>
          <dt className="text-slate-500">Service period</dt>
          <dd>
            {date(inv.periodStart)} – {date(lastDay(inv.periodEnd))}
          </dd>
          <dt className="text-slate-500">Subscription</dt>
          <dd>
            {inv.subscription.number} · {inv.subscription.plan.name}
            <span className="block text-xs text-slate-500">{periodLabel(inv.subscription.plan.billingPeriod, inv.subscription.plan.billingInterval)}</span>
          </dd>
        </dl>
      </section>

      <div className="overflow-x-auto py-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-slate-500">
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4 text-right">Qty</th>
              <th className="py-2 pr-4 text-right">Unit price</th>
              <th className="py-2 pr-4 text-right">Discount</th>
              <th className="py-2 pr-4 text-right">Tax</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-4">{l.description}</td>
                <td className="py-2 pr-4 text-right">{l.quantity}</td>
                <td className="py-2 pr-4 text-right">{money(l.unitPrice)}</td>
                <td className="py-2 pr-4 text-right text-emerald-700">{l.discountAmount ? `−${money(l.discountAmount)}` : '—'}</td>
                <td className="py-2 pr-4 text-right">
                  {money(l.taxAmount)} <span className="text-xs text-slate-400">{percent(l.taxRateBp)}</span>
                </td>
                <td className="py-2 text-right font-medium">{money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-wrap justify-between gap-6 border-t border-line pt-4 text-sm">
        <div className="space-y-1 text-slate-600">
          {inv.discounts.length > 0 && (
            <>
              <p className="text-xs text-slate-500">Discounts applied</p>
              {inv.discounts.map((d) => (
                <p key={d.discountId}>
                  <span className="font-mono text-xs">{d.discount.code}</span> {d.discount.name}: −{money(d.amount)}
                </p>
              ))}
            </>
          )}
          {inv.payments.length > 0 && (
            <>
              <p className="pt-2 text-xs text-slate-500">Payments received</p>
              {inv.payments.map((p) => (
                <p key={p.id}>
                  {date(p.paidOn)} · {paymentMethodLabel(p.method)} · {money(p.amount)}
                </p>
              ))}
            </>
          )}
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd>{money(inv.subtotal)}</dd>
          </div>
          {inv.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discounts</dt>
              <dd>−{money(inv.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">Tax</dt>
            <dd>{money(inv.taxTotal)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-base font-medium">
            <dt>Total</dt>
            <dd>{money(inv.total)}</dd>
          </div>
          {inv.amountPaid > 0 && (
            <div className="flex justify-between text-slate-600">
              <dt>Paid</dt>
              <dd>−{money(inv.amountPaid)}</dd>
            </div>
          )}
          {inv.status !== 'CANCELLED' && (
            <div className="flex justify-between font-medium text-slate-900">
              <dt>Amount due</dt>
              <dd>{money(inv.outstanding)}</dd>
            </div>
          )}
        </dl>
      </section>
    </article>
  )
}
