import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { Loader2, X } from 'lucide-react'
import { humanize } from '../lib/format'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

// Primary is the plum accent on light surfaces and an off-white fill on dark ones.
const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-white dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]',
  secondary: 'border border-line-strong bg-surface text-slate-800 hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 dark:hover:bg-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-[15px]',
}

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:h-4 [&_svg]:w-4'

/** Button styling for links that look like buttons. */
export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) => clsx(buttonBase, variants[variant], sizes[size], className)

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  )
}

const fieldBase =
  'block w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={clsx(fieldBase, 'h-9', className)} {...props} />
))
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={clsx(fieldBase, 'h-9 pr-8', className)} {...props} />
))
Select.displayName = 'Select'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={clsx(fieldBase, 'py-2', className)} rows={3} {...props} />
))
Textarea.displayName = 'Textarea'

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('card-hover rounded-xl border border-line bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

/** A figure with its label: the building block of every summary row. */
export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'accent'; className?: string }) {
  return (
    <div className={clsx('card-hover animate-fade-up rounded-xl border border-line bg-surface p-5 shadow-card', className)}>
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className={clsx('stat-shimmer mt-2 text-[26px] leading-none font-medium tracking-[-0.01em]', tone === 'danger' ? 'text-red-600' : tone === 'accent' ? 'text-brand-600' : 'text-slate-900')}>{value}</p>
      {hint && <p className="mt-2 font-mono text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.015em] text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// Status is a coloured dot next to a quiet label; colour only carries the meaning.
const statusDots: Record<string, string> = {
  DRAFT: 'bg-slate-400',
  QUOTATION: 'bg-sky-400',
  CONFIRMED: 'bg-indigo-400',
  ACTIVE: 'bg-emerald-500',
  PAUSED: 'bg-amber-500',
  CLOSED: 'bg-slate-300',
  PAID: 'bg-emerald-500',
  CANCELLED: 'bg-slate-300',
  OVERDUE: 'bg-red-500',
  RUNNING: 'bg-sky-400',
  COMPLETED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  ADMIN: 'bg-brand-600',
  STAFF: 'bg-sky-400',
  CUSTOMER: 'bg-slate-400',
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const alert = status === 'OVERDUE' || status === 'FAILED'
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap',
        alert ? 'badge-alert border-red-200 bg-red-50 text-red-700' : 'border-line bg-surface text-slate-700',
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', statusDots[status] ?? 'bg-slate-400')} />
      {label ?? humanize(status)}
    </span>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  // Portalled to <body> so no transformed ancestor can trap its fixed positioning.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 dark:bg-black/60" onMouseDown={onClose}>
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className="animate-rise flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-float sm:max-h-[calc(100dvh-3rem)]"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <header className="flex shrink-0 items-center justify-between px-6 pt-5 pb-2">
            <h3 className="text-base font-medium text-slate-900">{title}</h3>
            <button onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>
          {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3">
      <span className="font-mono text-xs text-slate-500">
        {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

/** Simple table: pass header labels and rows as children. */
export function Table({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {headers.map((h, i) => (
              <th key={i} className="h-10 px-4 text-left text-xs font-medium whitespace-nowrap text-slate-500 first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:table-row-hover [&>tr]:transition-colors [&>tr]:duration-150">{children}</tbody>
      </table>
    </div>
  )
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={clsx('h-12 px-4 whitespace-nowrap text-slate-700 first:pl-5 last:pr-5', className)}>{children}</td>
)
