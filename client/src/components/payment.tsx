import { useState } from 'react'
import { PAYMENT_METHODS, paymentMethodLabel, type Payment, type PaymentMethod } from '../api/types'
import { ApiError } from '../api/client'
import { date, money, toMinor, todayIso } from '../lib/format'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

export interface PaymentDraft {
  method: PaymentMethod
  amount: number
  paidOn: string
  note?: string
}

/** Records a payment; the amount defaults to what is still outstanding. */
export function RecordPaymentModal({
  outstanding,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  outstanding: number
  loading: boolean
  error: unknown
  onClose: () => void
  onSubmit: (p: PaymentDraft) => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('UPI')
  const [amount, setAmount] = useState((outstanding / 100).toFixed(2))
  const [paidOn, setPaidOn] = useState(todayIso())
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const minor = toMinor(Number(amount))
  const amountError = !Number.isFinite(Number(amount)) || minor <= 0 ? 'Enter an amount above zero' : minor > outstanding ? `Cannot exceed the outstanding ${money(outstanding)}` : undefined
  const dateError = !paidOn ? 'Choose the payment date' : paidOn > todayIso() ? 'The payment date cannot be in the future' : undefined
  const serverMessage = error instanceof ApiError ? error.message : null

  const submit = () => {
    setTouched(true)
    if (amountError || dateError) return
    onSubmit({ method, amount: minor, paidOn, note: note.trim() || undefined })
  }

  return (
    <Modal
      open
      title="Record payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={submit}>
            Record {Number.isFinite(minor) && minor > 0 ? money(minor) : 'payment'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p className="text-sm text-slate-600">
          Outstanding: <span className="font-medium text-slate-900">{money(outstanding)}</span>. A smaller amount is recorded as a part payment.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" error={touched ? amountError : undefined}>
            <Input type="number" inputMode="decimal" step="0.01" min="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Paid on" error={touched ? dateError : undefined}>
            <Input type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)" hint="e.g. UTR / cheque number">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        {serverMessage && <p className="text-sm text-red-600">{serverMessage}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export function PaymentList({ payments }: { payments: Payment[] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 py-2">
          <div>
            <p className="font-medium text-slate-800">{paymentMethodLabel(p.method)}</p>
            <p className="text-xs text-slate-500">
              {date(p.paidOn)}
              {p.recordedBy && ` · by ${p.recordedBy.name}`}
            </p>
            {p.note && <p className="text-xs text-slate-500">{p.note}</p>}
          </div>
          <span className="font-medium text-emerald-700">{money(p.amount)}</span>
        </li>
      ))}
    </ul>
  )
}
